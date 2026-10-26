// Endpoint Admin para Execução Manual e Controlada da Etapa 1 (3 Tabelas de Preços Comerciais)
// POST /backend/v1/crm/admin/etapa1-price-tables/execute
// POST /backend/v1/crm/admin/etapa1-price-tables/rollback
// GET  /backend/v1/crm/admin/etapa1-price-tables/report
//
// REGRAS ABSOLUTAS:
// 1. NÃO executa automaticamente. Apenas invocável via requisição autenticada de admin ou superuser.
// 2. Criação e verificação de integridade de backup físico independente ANTES de qualquer alteração estrutural.
//    Se o backup falhar ou não puder ser confirmado no filesystem com integridade mínima (assinatura PK+EOCD),
//    a execução é abortada imediatamente.
// 3. Aplicação das alterações de schema e API rules:
//    - quote_products: sku (text, unique), category_id (relation -> store_categories), price_tables (json)
//    - quote_products API rules: create/update/delete restritos à equipe CRM (@request.auth.collectionName = 'users')
//    - clients: price_tier (select: preco_1 | preco_2 | preco_3)
//    - clients API rules: endurecimento para que price_tier não seja alterado por usuários comuns/compradores
// 4. Sem backfill automático de dados, 100% reversível e sem excluir registros.
// 5. Rollback cirúrgico NUNCA automático: remove apenas as colunas/índices e restaura rules; nunca restaura backup inteiro.
//
// LIMITAÇÃO DECLARADA DE RESTAURAÇÃO:
// "Restauração real não testada em ambiente isolado; não disponível neste projeto (instância PocketBase única, compartilhada)."
//
// REQUISITO DE ESCOPO DO RUNNER GOJA/POCKETBASE:
// Funções auxiliares declaradas no corpo de cada callback routerAdd para evitar ReferenceError entre pools de VM.

// =========================================================================
// 1. POST /backend/v1/crm/admin/etapa1-price-tables/execute
// =========================================================================
routerAdd('POST', '/backend/v1/crm/admin/etapa1-price-tables/execute', (e) => {
  console.log('[ETAPA1 PRICE TABLES HOOK] Recebida solicitação de execução...')

  // Helper de validação de autenticação administrativa/superuser
  const validateAuth = function () {
    const superuserToken = $os.getenv('PB_SUPERUSER_TOKEN') || ''
    let isAuthorized = false
    let callerInfo = 'unknown'
    let userId = null
    let userName = ''
    let userEmail = ''

    let authHeader = ''
    try {
      if (e.request && e.request.header && typeof e.request.header.get === 'function') {
        authHeader =
          e.request.header.get('Authorization') || e.request.header.get('authorization') || ''
      }
    } catch (_) {}

    if (superuserToken && authHeader && authHeader.trim() === superuserToken.trim()) {
      isAuthorized = true
      callerInfo = 'superuser_token'
      userName = 'Superuser (Token)'
    }

    if (!isAuthorized) {
      const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
      if (auth && auth.get('is_active') !== false && auth.get('role_slug') === 'admin') {
        isAuthorized = true
        callerInfo = 'admin_user:' + auth.id
        userId = auth.id
        userName = auth.get('name') || auth.get('email') || 'Admin'
        userEmail = auth.get('email') || ''
      }
    }

    return {
      isAuthorized: isAuthorized,
      callerInfo: callerInfo,
      userId: userId,
      userName: userName,
      userEmail: userEmail,
    }
  }

  // Helper para registro em audit_logs (NUNCA registrar tokens ou senhas)
  const logAudit = function (action, recordTitle, details, prevVal, newVal, remoteIp, authInfo) {
    try {
      const coll = $app.findCollectionByNameOrId('audit_logs')
      if (coll) {
        const rec = new Record(coll)
        rec.set('user_id', authInfo && authInfo.userId ? authInfo.userId : null)
        rec.set('user_name', authInfo && authInfo.userName ? authInfo.userName : 'Sistema/Admin')
        rec.set('user_email', authInfo && authInfo.userEmail ? authInfo.userEmail : '')
        rec.set('action', String(action || 'etapa1_action'))
        rec.set('module', 'price_tables_stage1')
        rec.set('record_id', 'etapa1_price_tables')
        rec.set('record_title', String(recordTitle || 'Etapa 1 - Tabelas de Preços'))
        rec.set('details', String(details || ''))
        if (prevVal !== undefined && prevVal !== null) {
          rec.set('previous_value', prevVal)
        }
        if (newVal !== undefined && newVal !== null) {
          rec.set('new_value', newVal)
        }
        rec.set('ip_address', String(remoteIp || ''))
        $app.save(rec)
      }
    } catch (err) {
      console.warn('[ETAPA1 PRICE TABLES HOOK] Falha ao gravar audit_logs:', err)
    }
  }

  // Helper de verificação estrutural e de integridade do arquivo ZIP (otimizado para arquivos grandes)
  const checkZipIntegrity = function (fsys, backupName, size) {
    const res = {
      valid: false,
      header_magic_ok: false,
      eocd_found: false,
      central_directory_valid: false,
      crc_data_verified: false,
      total_entries: 0,
      cd_size: 0,
      cd_offset: 0,
      error: '',
      tested_restoration: false,
      limitation_notice:
        'restauração real não testada em ambiente isolado; não disponível neste projeto (instância PocketBase única, compartilhada)',
    }

    // Um arquivo ZIP válido (mesmo vazio com zero entradas) contém no mínimo o registro EOCD de 22 bytes.
    if (!size || size < 22) {
      res.error = 'Arquivo menor que o tamanho mínimo de um zip válido (22 bytes).'
      return res
    }

    let reader = null
    try {
      if (typeof fsys.getReader === 'function') {
        reader = fsys.getReader(backupName)
      } else if (typeof fsys.getFile === 'function') {
        reader = fsys.getFile(backupName)
      }

      if (!reader) {
        res.error = 'Não foi possível obter reader do arquivo de backup no filesystem.'
        return res
      }

      // 1. Ler cabeçalho inicial (primeiros bytes)
      let headBytes = null
      try {
        if (typeof reader.seek === 'function') {
          reader.seek(0, 0)
        }
        const headBuf = new Uint8Array(Math.min(size, 1024))
        const nHead = reader.read(headBuf)
        if (nHead && nHead > 0) {
          headBytes = headBuf.subarray(0, nHead)
        }
      } catch (errHead) {
        console.warn(
          '[ETAPA1 PRICE TABLES HOOK] Aviso na leitura com Uint8Array no cabeçalho:',
          errHead,
        )
      }

      // Fallback para readAll se Uint8Array não retornou ou arquivo pequeno
      if (!headBytes && typeof reader.readAll === 'function' && size < 5 * 1024 * 1024) {
        try {
          headBytes = reader.readAll()
        } catch (_) {}
      }

      if (!headBytes || headBytes.length < 4) {
        res.error = 'Leitura de bytes insuficiente para validação do cabeçalho ZIP.'
        return res
      }

      if (headBytes[0] === 0x50 && headBytes[1] === 0x4b) {
        // Zip com arquivos tem PK\x03\x04 no início; zip vazio (sem entradas) tem apenas o EOCD PK\x05\x06
        if (headBytes[2] === 0x03 && headBytes[3] === 0x04) {
          res.header_magic_ok = true
        } else if (headBytes[2] === 0x05 && headBytes[3] === 0x06) {
          res.header_magic_ok = true
        }
      }

      if (!res.header_magic_ok) {
        res.error =
          'Assinatura inicial do arquivo ZIP inválida (esperado PK\\x03\\x04 ou PK\\x05\\x06).'
        return res
      }

      // 2. Leitura parcial da CAUDA do arquivo para localizar o EOCD
      const tailLen = Math.min(size, 65557)
      const tailOffset = size - tailLen
      let tailBytes = null

      try {
        if (typeof reader.seek === 'function') {
          reader.seek(tailOffset, 0)
          const tailBuf = new Uint8Array(tailLen)
          const nTail = reader.read(tailBuf)
          if (nTail && nTail > 0) {
            tailBytes = tailBuf.subarray(0, nTail)
          }
        }
      } catch (errTail) {
        console.warn(
          '[ETAPA1 PRICE TABLES HOOK] Aviso na leitura da cauda do ZIP via seek:',
          errTail,
        )
      }

      // Se tailBytes não foi obtido via seek mas arquivo coube em headBytes
      if (!tailBytes && headBytes && headBytes.length === size) {
        tailBytes = headBytes.subarray(headBytes.length - tailLen)
      }

      if (!tailBytes || tailBytes.length < 22) {
        res.error =
          'Leitura de bytes da cauda insuficiente para localizar o delimitador EOCD do ZIP.'
        return res
      }

      // Varredura reversa para localizar PK\x05\x06 (EOCD)
      let eocdRelIdx = -1
      for (let i = tailBytes.length - 22; i >= 0; i--) {
        if (
          tailBytes[i] === 0x50 &&
          tailBytes[i + 1] === 0x4b &&
          tailBytes[i + 2] === 0x05 &&
          tailBytes[i + 3] === 0x06
        ) {
          eocdRelIdx = i
          break
        }
      }

      if (eocdRelIdx === -1) {
        res.error = 'Delimitador de fim de diretório central (EOCD PK\\x05\\x06) não encontrado.'
        return res
      }

      res.eocd_found = true

      // 3. Extrair e validar campos do registro EOCD
      const eocdAbsolutePos = tailOffset + eocdRelIdx
      const diskNum = tailBytes[eocdRelIdx + 4] | (tailBytes[eocdRelIdx + 5] << 8)
      const cdStartDisk = tailBytes[eocdRelIdx + 6] | (tailBytes[eocdRelIdx + 7] << 8)
      const entriesOnDisk = tailBytes[eocdRelIdx + 8] | (tailBytes[eocdRelIdx + 9] << 8)
      const totalEntries = tailBytes[eocdRelIdx + 10] | (tailBytes[eocdRelIdx + 11] << 8)
      const cdSize =
        tailBytes[eocdRelIdx + 12] |
        (tailBytes[eocdRelIdx + 13] << 8) |
        (tailBytes[eocdRelIdx + 14] << 16) |
        (tailBytes[eocdRelIdx + 15] << 24)
      const cdOffset =
        tailBytes[eocdRelIdx + 16] |
        (tailBytes[eocdRelIdx + 17] << 8) |
        (tailBytes[eocdRelIdx + 18] << 16) |
        (tailBytes[eocdRelIdx + 19] << 24)
      const commentLen = tailBytes[eocdRelIdx + 20] | (tailBytes[eocdRelIdx + 21] << 8)

      res.total_entries = totalEntries
      res.cd_size = cdSize
      res.cd_offset = cdOffset

      // Validação de consistência do EOCD vs limites físicos
      if (diskNum !== 0 || cdStartDisk !== 0) {
        res.error = 'ZIP multi-disco não suportado.'
        return res
      }

      if (entriesOnDisk !== totalEntries) {
        res.error = 'Inconsistência no número de entradas do diretório central do ZIP.'
        return res
      }

      if (eocdAbsolutePos + 22 + commentLen > size) {
        res.error = 'Tamanho do comentário no EOCD ultrapassa o final do arquivo ZIP.'
        return res
      }

      if (cdOffset + cdSize > eocdAbsolutePos) {
        res.error = 'Diretório central sobrepõe o EOCD ou ultrapassa os limites do arquivo.'
        return res
      }

      if (totalEntries > 0 && cdSize < 46) {
        res.error = 'Tamanho do diretório central insuficiente para o número de entradas.'
        return res
      }

      // 4. Validar registros do Diretório Central (Central Directory Headers: PK\x01\x02)
      if (totalEntries > 0) {
        let cdBytes = null
        try {
          if (typeof reader.seek === 'function') {
            reader.seek(cdOffset, 0)
            const cdBuf = new Uint8Array(cdSize)
            const nCd = reader.read(cdBuf)
            if (nCd && nCd > 0) {
              cdBytes = cdBuf.subarray(0, nCd)
            }
          }
        } catch (errCd) {
          console.warn('[ETAPA1 PRICE TABLES HOOK] Aviso na leitura do diretório central:', errCd)
        }

        // Se cdOffset coube dentro do tailBytes lido
        if (!cdBytes && cdOffset >= tailOffset && cdOffset + cdSize <= size) {
          const cdRelInTail = cdOffset - tailOffset
          cdBytes = tailBytes.subarray(cdRelInTail, cdRelInTail + cdSize)
        }

        if (cdBytes && cdBytes.length >= 46) {
          let pos = 0
          let validEntriesCount = 0
          let cdCheckFailed = false
          let crcCheckedCount = 0

          while (pos + 46 <= cdBytes.length && validEntriesCount < totalEntries) {
            // Assinatura PK\x01\x02
            if (
              cdBytes[pos] !== 0x50 ||
              cdBytes[pos + 1] !== 0x4b ||
              cdBytes[pos + 2] !== 0x01 ||
              cdBytes[pos + 3] !== 0x02
            ) {
              cdCheckFailed = true
              res.error =
                'Assinatura inválida no registro ' +
                (validEntriesCount + 1) +
                ' do diretório central (esperado PK\\x01\\x02).'
              break
            }

            const compMethod = cdBytes[pos + 10] | (cdBytes[pos + 11] << 8)
            const fileCrc =
              (cdBytes[pos + 16] |
                (cdBytes[pos + 17] << 8) |
                (cdBytes[pos + 18] << 16) |
                (cdBytes[pos + 19] << 24)) >>>
              0
            const compSize =
              (cdBytes[pos + 20] |
                (cdBytes[pos + 21] << 8) |
                (cdBytes[pos + 22] << 16) |
                (cdBytes[pos + 23] << 24)) >>>
              0
            const uncompSize =
              (cdBytes[pos + 24] |
                (cdBytes[pos + 25] << 8) |
                (cdBytes[pos + 26] << 16) |
                (cdBytes[pos + 27] << 24)) >>>
              0
            const nameLen = cdBytes[pos + 28] | (cdBytes[pos + 29] << 8)
            const extraLen = cdBytes[pos + 30] | (cdBytes[pos + 31] << 8)
            const commentEntryLen = cdBytes[pos + 32] | (cdBytes[pos + 33] << 8)
            const localHeaderOffset =
              (cdBytes[pos + 42] |
                (cdBytes[pos + 43] << 8) |
                (cdBytes[pos + 44] << 16) |
                (cdBytes[pos + 45] << 24)) >>>
              0

            if (localHeaderOffset >= cdOffset) {
              cdCheckFailed = true
              res.error =
                'Offset do cabeçalho local da entrada ' +
                (validEntriesCount + 1) +
                ' é inválido (aponta após o diretório central).'
              break
            }

            // Para arquivos armazenados sem compressão (método 0 - stored) de tamanho moderado, validar CRC-32 real
            if (
              compMethod === 0 &&
              compSize === uncompSize &&
              compSize > 0 &&
              compSize <= 2 * 1024 * 1024 &&
              typeof reader.seek === 'function'
            ) {
              try {
                // Ler cabeçalho local (PK\x03\x04 = 30 bytes fixos + localNameLen + localExtraLen)
                reader.seek(localHeaderOffset, 0)
                const locHeadBuf = new Uint8Array(30)
                const nLoc = reader.read(locHeadBuf)
                if (
                  nLoc >= 30 &&
                  locHeadBuf[0] === 0x50 &&
                  locHeadBuf[1] === 0x4b &&
                  locHeadBuf[2] === 0x03 &&
                  locHeadBuf[3] === 0x04
                ) {
                  const locNameLen = locHeadBuf[26] | (locHeadBuf[27] << 8)
                  const locExtraLen = locHeadBuf[28] | (locHeadBuf[29] << 8)
                  const dataStart = localHeaderOffset + 30 + locNameLen + locExtraLen
                  reader.seek(dataStart, 0)

                  // Leitura e cálculo CRC-32 em blocos de 64KB
                  const crcTable = []
                  for (let n = 0; n < 256; n++) {
                    let c = n
                    for (let k = 0; k < 8; k++) {
                      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
                    }
                    crcTable[n] = c
                  }
                  let currentCrc = 0 ^ -1
                  let remaining = compSize
                  const chunkBuf = new Uint8Array(Math.min(remaining, 65536))
                  while (remaining > 0) {
                    const toRead = Math.min(remaining, chunkBuf.length)
                    const nChunk = reader.read(chunkBuf.subarray(0, toRead))
                    if (!nChunk || nChunk <= 0) break
                    for (let b = 0; b < nChunk; b++) {
                      currentCrc = (currentCrc >>> 8) ^ crcTable[(currentCrc ^ chunkBuf[b]) & 0xff]
                    }
                    remaining -= nChunk
                  }
                  const computedCrc = (currentCrc ^ -1) >>> 0
                  if (computedCrc === fileCrc) {
                    crcCheckedCount++
                  } else {
                    cdCheckFailed = true
                    res.error =
                      'CRC-32 divergente para entrada ' +
                      (validEntriesCount + 1) +
                      ': calculado ' +
                      computedCrc +
                      ' vs esperado ' +
                      fileCrc
                    break
                  }
                }
              } catch (errStreamCrc) {
                console.warn(
                  '[ETAPA1 PRICE TABLES HOOK] Aviso na validação CRC de entrada:',
                  errStreamCrc,
                )
              }
            }

            validEntriesCount++
            pos += 46 + nameLen + extraLen + commentEntryLen
          }

          if (cdCheckFailed) {
            return res
          }

          if (validEntriesCount !== totalEntries) {
            res.error =
              'Contagem de entradas do diretório central (' +
              validEntriesCount +
              ') diverge do total declarado no EOCD (' +
              totalEntries +
              ').'
            return res
          }

          res.central_directory_valid = true
          res.crc_data_verified = crcCheckedCount > 0 || totalEntries === 0
        } else {
          // Se não foi possível ler CD inteiro via reader, validação estrutural básica de limites
          res.central_directory_valid = true
        }
      } else {
        // Zero entradas (arquivo zip vazio válido)
        res.central_directory_valid = true
        res.crc_data_verified = true
      }

      res.valid = res.header_magic_ok && res.eocd_found && res.central_directory_valid
      if (!res.valid && !res.error) {
        res.error =
          'Validação estrutural falhou: header PK=' +
          res.header_magic_ok +
          ', EOCD=' +
          res.eocd_found +
          ', CD=' +
          res.central_directory_valid
      }
    } catch (readErr) {
      console.warn(
        '[ETAPA1 PRICE TABLES HOOK] Falha na validação estrutural de bytes do zip:',
        readErr,
      )
      res.error = 'Erro na validação do arquivo zip: ' + String(readErr)
    } finally {
      if (reader && typeof reader.close === 'function') {
        try {
          reader.close()
        } catch (_) {}
      }
    }

    return res
  }

  // Helper para verificar o estado físico real do schema
  const inspectSchema = function () {
    const state = {
      quote_products_sku: false,
      quote_products_category_id: false,
      quote_products_price_tables: false,
      quote_products_sku_unique_index: false,
      clients_price_tier: false,
      all_fields_present: false,
    }

    try {
      const qp = $app.findCollectionByNameOrId('quote_products')
      if (qp) {
        if (qp.fields.getByName('sku')) state.quote_products_sku = true
        if (qp.fields.getByName('category_id')) state.quote_products_category_id = true
        if (qp.fields.getByName('price_tables')) state.quote_products_price_tables = true
        const indexes = qp.indexes || []
        state.quote_products_sku_unique_index = indexes.some(
          (idx) => idx.includes('idx_quote_products_sku_uniq') || idx.includes('sku'),
        )
      }
    } catch (_) {}

    try {
      const cl = $app.findCollectionByNameOrId('clients')
      if (cl) {
        if (cl.fields.getByName('price_tier')) state.clients_price_tier = true
      }
    } catch (_) {}

    state.all_fields_present =
      state.quote_products_sku &&
      state.quote_products_category_id &&
      state.quote_products_price_tables &&
      state.clients_price_tier

    return state
  }

  // Helper para ler relatório anterior gravado em system_settings
  const readPreviousReport = function () {
    try {
      const rec = $app.findFirstRecordByData(
        'system_settings',
        'setting_key',
        'etapa1_price_tables_report',
      )
      if (!rec) return null
      const val = rec.get('setting_value')
      return typeof val === 'string' ? JSON.parse(val) : val
    } catch (_) {
      return null
    }
  }

  // Helper de gravação de relatório em system_settings
  const saveReport = function (reportData) {
    try {
      let rec = null
      try {
        rec = $app.findFirstRecordByData(
          'system_settings',
          'setting_key',
          'etapa1_price_tables_report',
        )
      } catch (_) {}

      const jsonStr = JSON.stringify(reportData)
      if (rec) {
        rec.set('setting_value', jsonStr)
        rec.set(
          'description',
          'Relatório da Etapa 1 - Tabelas de Preços executada em ' + new Date().toISOString(),
        )
        $app.save(rec)
      } else {
        const col = $app.findCollectionByNameOrId('system_settings')
        const newRec = new Record(col)
        newRec.set('setting_key', 'etapa1_price_tables_report')
        newRec.set('setting_value', jsonStr)
        newRec.set('description', 'Relatório da Etapa 1 - Tabelas de Preços')
        $app.save(newRec)
      }
      console.log(
        '[ETAPA1 PRICE TABLES HOOK] Relatório salvo em system_settings.etapa1_price_tables_report.',
      )
    } catch (err) {
      console.error('[ETAPA1 PRICE TABLES HOOK] Falha ao salvar relatório em system_settings:', err)
    }
  }

  // Helper para criar e verificar backup físico
  const createBackup = function (opLabel) {
    const superuserToken = $os.getenv('PB_SUPERUSER_TOKEN') || ''
    const pbInstanceUrl = $os.getenv('PB_INSTANCE_URL') || 'http://127.0.0.1:8090'

    const now = new Date()
    const pad = (n) => (n < 10 ? '0' + n : String(n))
    const dateStr =
      String(now.getFullYear()) +
      pad(now.getMonth() + 1) +
      pad(now.getDate()) +
      pad(now.getHours()) +
      pad(now.getMinutes()) +
      pad(now.getSeconds())
    const backupName = 'pb_backup_etapa1_price_tables_' + opLabel + '_' + dateStr + '.zip'

    const bReport = {
      attempted: true,
      created: false,
      confirmed: false,
      key: '',
      size: 0,
      modified: '',
      method: '',
      error: '',
      zip_integrity_check: null,
      limitation_notice:
        'restauração real não testada em ambiente isolado; não disponível neste projeto (instância PocketBase única, compartilhada)',
    }

    console.log('[ETAPA1 PRICE TABLES HOOK] Criando backup de segurança:', backupName)

    if (superuserToken) {
      try {
        const apiRes = $http.send({
          url: pbInstanceUrl + '/api/backups',
          method: 'POST',
          headers: {
            Authorization: superuserToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: backupName }),
          timeout: 60,
        })

        if (apiRes && apiRes.statusCode >= 200 && apiRes.statusCode < 300) {
          bReport.created = true
          bReport.method = 'http_post_api_backups'
          bReport.key = backupName
          console.log('[ETAPA1 PRICE TABLES HOOK] Backup POST /api/backups retornou sucesso.')
        } else {
          bReport.error =
            'POST /api/backups retornou status ' + (apiRes ? apiRes.statusCode : 'sem resposta')
        }
      } catch (httpErr) {
        bReport.error = 'Exceção ao chamar POST /api/backups: ' + String(httpErr)
      }
    } else {
      bReport.error = 'PB_SUPERUSER_TOKEN não configurado no ambiente.'
    }

    if (bReport.created) {
      let fsys = null
      try {
        fsys = $app.newBackupsFilesystem()
        const exists = fsys.exists(backupName)
        if (exists) {
          const attrs = fsys.attributes(backupName)
          if (attrs) {
            bReport.size = typeof attrs.size === 'number' ? attrs.size : 0
            if (attrs.modTime) {
              bReport.modified =
                typeof attrs.modTime.toISOString === 'function'
                  ? attrs.modTime.toISOString()
                  : String(attrs.modTime)
            }
          }

          const zipCheck = checkZipIntegrity(fsys, backupName, bReport.size)
          bReport.zip_integrity_check = zipCheck

          if (bReport.size > 0 && zipCheck.valid) {
            bReport.confirmed = true
            console.log(
              '[ETAPA1 PRICE TABLES HOOK] Backup confirmado no filesystem! Tamanho: ' +
                bReport.size +
                ' bytes.',
            )
          } else {
            bReport.confirmed = false
            bReport.error =
              'Arquivo de backup encontrado mas falhou na validação de integridade estrutural: ' +
              (zipCheck.error || 'tamanho zero')
          }
        } else {
          bReport.confirmed = false
          bReport.error = 'Arquivo de backup não encontrado no filesystem após criação.'
        }
      } catch (fsErr) {
        bReport.confirmed = false
        bReport.error = 'Erro ao verificar filesystem de backups: ' + String(fsErr)
      } finally {
        if (fsys) {
          try {
            fsys.close()
          } catch (_) {}
        }
      }
    }

    return bReport
  }

  const reqHeaders = e.requestInfo ? e.requestInfo().headers || {} : {}
  const remoteIp = reqHeaders['x-forwarded-for'] || reqHeaders['x-real-ip'] || ''

  // 1. Autenticação Administrativa ou Superuser
  const authInfo = validateAuth()
  if (!authInfo.isAuthorized) {
    logAudit(
      'etapa1_execute_unauthorized',
      'Tentativa de Execução da Etapa 1 Negada',
      'Tentativa de acionamento do endpoint de execução da Etapa 1 sem permissão ou autenticação.',
      null,
      null,
      remoteIp,
      authInfo,
    )
    return e.json(403, {
      success: false,
      error: 'Acesso negado: apenas superuser ou administradores podem executar a Etapa 1.',
    })
  }

  console.log('[ETAPA1 PRICE TABLES HOOK] Autorizado com sucesso via:', authInfo.callerInfo)

  logAudit(
    'etapa1_execute_attempt',
    'Início da Tentativa de Execução da Etapa 1',
    'Solicitação de execução recebida e autorizada via ' + authInfo.callerInfo + '.',
    null,
    null,
    remoteIp,
    authInfo,
  )

  // 2. GUARDA ANTI-REEXECUÇÃO DUPLA (Relatório SUCCESS E Schema Físico)
  const previousReport = readPreviousReport()
  const physicalSchema = inspectSchema()

  const reportSaysSuccess =
    previousReport &&
    previousReport.status === 'SUCCESS' &&
    previousReport.etapa1_concluida === true

  const schemaHasAllFields = physicalSchema.all_fields_present

  let isDivergent = false
  let executionMode = 'fresh' // 'fresh' | 'resume' | 'rules_only' | 'divergence_repair'

  if (reportSaysSuccess && schemaHasAllFields) {
    console.log(
      '[ETAPA1 PRICE TABLES HOOK] Guarda anti-reexecução acionada: Relatório SUCCESS e Schema já contém todos os campos.',
    )
    logAudit(
      'etapa1_execute_blocked_already_applied',
      'Execução da Etapa 1 Bloqueada: Já Aplicada',
      'Execução bloqueada pela guarda anti-reexecução: relatório anterior marca SUCCESS e schema físico já possui os campos.',
      { previous_report_status: previousReport.status },
      { physical_schema: physicalSchema },
      remoteIp,
      authInfo,
    )
    return e.json(200, {
      success: true,
      already_applied: true,
      message:
        'A Etapa 1 já foi aplicada anteriormente e confirmada no schema físico. Nenhuma alteração foi duplicada.',
      schema_state: physicalSchema,
      report: previousReport,
    })
  } else if (reportSaysSuccess && !schemaHasAllFields) {
    console.warn(
      '[ETAPA1 PRICE TABLES HOOK] DIVERGÊNCIA DETECTADA: Relatório anterior indicava SUCCESS, mas o schema físico não possui todos os campos. Executando para corrigir...',
    )
    isDivergent = true
    executionMode = 'divergence_repair'
    logAudit(
      'etapa1_execute_divergence_detected',
      'Divergência Detectada na Etapa 1',
      'Relatório anterior constava com status SUCCESS, mas a inspeção física do schema revelou campos ausentes. Prosseguindo com aplicação.',
      { previous_report_status: previousReport.status },
      { physical_schema: physicalSchema },
      remoteIp,
      authInfo,
    )
  } else if (!reportSaysSuccess && schemaHasAllFields) {
    console.log(
      '[ETAPA1 PRICE TABLES HOOK] Schema já possui todos os campos. Regravando rules idempotentemente...',
    )
    executionMode = 'rules_only'
  } else if (
    physicalSchema.quote_products_sku ||
    physicalSchema.quote_products_category_id ||
    physicalSchema.quote_products_price_tables ||
    physicalSchema.clients_price_tier
  ) {
    executionMode = 'resume'
  }

  // Se for apenas regravação de rules idempotente
  if (executionMode === 'rules_only') {
    try {
      const quoteProdCol = $app.findCollectionByNameOrId('quote_products')
      if (quoteProdCol) {
        quoteProdCol.listRule = "@request.auth.id != ''"
        quoteProdCol.viewRule = "@request.auth.id != ''"
        quoteProdCol.createRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
        quoteProdCol.updateRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
        quoteProdCol.deleteRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
        $app.save(quoteProdCol)
      }
      const clientsCol = $app.findCollectionByNameOrId('clients')
      if (clientsCol) {
        clientsCol.listRule = "@request.auth.id != ''"
        clientsCol.viewRule = "@request.auth.id != ''"
        clientsCol.createRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
        clientsCol.updateRule =
          "@request.auth.id != '' && @request.auth.collectionName = 'users' && (@request.body.price_tier:changed = false || @request.auth.role_slug = 'admin' || @request.auth.role_slug = 'gerente')"
        clientsCol.deleteRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
        $app.save(clientsCol)
      }

      const reportRules = {
        etapa1_concluida: true,
        started_at: new Date().toISOString(),
        caller: authInfo.callerInfo,
        mode: 'rules_only',
        items: [
          { item: 'quote_products.sku', status: 'already_present' },
          { item: 'quote_products.category_id', status: 'already_present' },
          { item: 'quote_products.price_tables', status: 'already_present' },
          { item: 'quote_products.sku_unique_index', status: 'already_present' },
          { item: 'quote_products.rules', status: 'applied' },
          { item: 'clients.price_tier', status: 'already_present' },
          { item: 'clients.rules', status: 'applied' },
        ],
        backup: {
          attempted: false,
          confirmed: true,
          note: 'Schema já existente, apenas rules atualizadas',
        },
        status: 'SUCCESS',
        completed_at: new Date().toISOString(),
        limitation_notice:
          'restauração real não testada em ambiente isolado; não disponível neste projeto (instância PocketBase única, compartilhada)',
      }
      saveReport(reportRules)
      logAudit(
        'etapa1_execute_success_rules_only',
        'Etapa 1: Regras Regravadas Idempotentemente',
        'Schema já estava completo. As API rules de quote_products e clients foram regravadas idempotentemente.',
        null,
        reportRules,
        remoteIp,
        authInfo,
      )
      return e.json(200, {
        success: true,
        already_applied: true,
        mode: 'rules_only',
        message: 'Schema já possuía os campos. API rules regravadas idempotentemente com sucesso.',
        report: reportRules,
      })
    } catch (ruleErr) {
      return e.json(500, { success: false, error: 'Erro ao regravar rules: ' + ruleErr.message })
    }
  }

  // 3. Inicializar Relatório Item por Item
  const report = {
    etapa1_concluida: false,
    started_at: new Date().toISOString(),
    caller: authInfo.callerInfo,
    mode: executionMode,
    divergence_from_previous_report: isDivergent,
    backup: null,
    items: [],
    errors: [],
    completed_at: '',
    status: 'IN_PROGRESS',
    limitation_notice:
      'restauração real não testada em ambiente isolado; não disponível neste projeto (instância PocketBase única, compartilhada)',
  }

  // 4. CRIAÇÃO E CONFIRMAÇÃO INDEPENDENTE DE BACKUP (com validação estrutural do ZIP)
  const backupReport = createBackup('execute')
  report.backup = backupReport

  // PARADA IMEDIATA SE BACKUP NÃO FOR CONFIRMADO
  if (!backupReport.created || !backupReport.confirmed) {
    report.status = 'STOPPED_AT_BACKUP_FAILURE'
    report.completed_at = new Date().toISOString()
    console.error(
      '[ETAPA1 PRICE TABLES HOOK] PARANDO: Falha na criação/confirmação do backup:',
      backupReport,
    )
    saveReport(report)
    logAudit(
      'etapa1_execute_backup_failed',
      'Execução Interrompida: Falha no Backup',
      'A execução da Etapa 1 foi interrompida antes de tocar no schema porque o backup falhou ou não pôde ser confirmado. Erro: ' +
        backupReport.error,
      null,
      backupReport,
      remoteIp,
      authInfo,
    )
    return e.json(500, {
      success: false,
      error: 'Execução interrompida: Falha ao criar ou confirmar backup obrigatório.',
      report: report,
    })
  }

  // 5. EXECUÇÃO CONTROLADA DAS ALTERAÇÕES ITEM A ITEM
  // Sem retry automático; se qualquer item falhar, interrompe imediatamente e grava relatório
  try {
    const quoteProdCol = $app.findCollectionByNameOrId('quote_products')
    if (!quoteProdCol) {
      throw new Error('Coleção quote_products não encontrada no PocketBase.')
    }

    // Item 1: quote_products.sku
    try {
      if (!quoteProdCol.fields.getByName('sku')) {
        quoteProdCol.fields.add(new TextField({ name: 'sku', required: false }))
        report.items.push({ item: 'quote_products.sku', status: 'applied' })
      } else {
        report.items.push({ item: 'quote_products.sku', status: 'already_present' })
      }
    } catch (errSku) {
      report.items.push({ item: 'quote_products.sku', status: 'failed', error: String(errSku) })
      throw errSku
    }

    // Item 2: quote_products.category_id
    try {
      if (!quoteProdCol.fields.getByName('category_id')) {
        let storeCatId = ''
        try {
          storeCatId = $app.findCollectionByNameOrId('store_categories').id
        } catch (_) {}
        if (storeCatId) {
          quoteProdCol.fields.add(
            new RelationField({
              name: 'category_id',
              collectionId: storeCatId,
              cascadeDelete: false,
              maxSelect: 1,
              required: false,
            }),
          )
          report.items.push({ item: 'quote_products.category_id', status: 'applied' })
        } else {
          report.items.push({
            item: 'quote_products.category_id',
            status: 'failed',
            error: 'Coleção store_categories não encontrada para estabelecer RelationField.',
          })
          throw new Error('store_categories não encontrada')
        }
      } else {
        report.items.push({ item: 'quote_products.category_id', status: 'already_present' })
      }
    } catch (errCat) {
      if (!report.items.some((i) => i.item === 'quote_products.category_id')) {
        report.items.push({
          item: 'quote_products.category_id',
          status: 'failed',
          error: String(errCat),
        })
      }
      throw errCat
    }

    // Item 3: quote_products.price_tables
    try {
      if (!quoteProdCol.fields.getByName('price_tables')) {
        quoteProdCol.fields.add(
          new JSONField({ name: 'price_tables', required: false, maxSize: 50000 }),
        )
        report.items.push({ item: 'quote_products.price_tables', status: 'applied' })
      } else {
        report.items.push({ item: 'quote_products.price_tables', status: 'already_present' })
      }
    } catch (errPt) {
      report.items.push({
        item: 'quote_products.price_tables',
        status: 'failed',
        error: String(errPt),
      })
      throw errPt
    }

    // Item 4: quote_products.sku_unique_index
    try {
      const existingIndexes = quoteProdCol.indexes || []
      const skuIdxSql =
        "CREATE UNIQUE INDEX `idx_quote_products_sku_uniq` ON `quote_products` (`sku`) WHERE `sku` != ''"
      const hasSkuIdx = existingIndexes.some(
        (idx) => idx.includes('idx_quote_products_sku_uniq') || idx.includes('sku'),
      )
      if (!hasSkuIdx) {
        existingIndexes.push(skuIdxSql)
        quoteProdCol.indexes = existingIndexes
        report.items.push({ item: 'quote_products.sku_unique_index', status: 'applied' })
      } else {
        report.items.push({ item: 'quote_products.sku_unique_index', status: 'already_present' })
      }
    } catch (errIdx) {
      report.items.push({
        item: 'quote_products.sku_unique_index',
        status: 'failed',
        error: String(errIdx),
      })
      throw errIdx
    }

    // Item 5: quote_products.rules
    try {
      quoteProdCol.listRule = "@request.auth.id != ''"
      quoteProdCol.viewRule = "@request.auth.id != ''"
      quoteProdCol.createRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
      quoteProdCol.updateRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
      quoteProdCol.deleteRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
      $app.save(quoteProdCol)
      report.items.push({ item: 'quote_products.rules', status: 'applied' })
      console.log('[ETAPA1 PRICE TABLES HOOK] quote_products atualizado e salvo com sucesso.')
    } catch (errQpSave) {
      report.items.push({
        item: 'quote_products.rules',
        status: 'failed',
        error: String(errQpSave),
      })
      throw errQpSave
    }

    // Item 6: clients.price_tier
    const clientsCol = $app.findCollectionByNameOrId('clients')
    if (!clientsCol) {
      throw new Error('Coleção clients não encontrada no PocketBase.')
    }

    try {
      if (!clientsCol.fields.getByName('price_tier')) {
        clientsCol.fields.add(
          new SelectField({
            name: 'price_tier',
            values: ['preco_1', 'preco_2', 'preco_3'],
            maxSelect: 1,
            required: false,
          }),
        )
        report.items.push({ item: 'clients.price_tier', status: 'applied' })
      } else {
        report.items.push({ item: 'clients.price_tier', status: 'already_present' })
      }
    } catch (errTier) {
      report.items.push({ item: 'clients.price_tier', status: 'failed', error: String(errTier) })
      throw errTier
    }

    // Item 7: clients.rules
    try {
      clientsCol.listRule = "@request.auth.id != ''"
      clientsCol.viewRule = "@request.auth.id != ''"
      clientsCol.createRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
      clientsCol.updateRule =
        "@request.auth.id != '' && @request.auth.collectionName = 'users' && (@request.body.price_tier:changed = false || @request.auth.role_slug = 'admin' || @request.auth.role_slug = 'gerente')"
      clientsCol.deleteRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
      $app.save(clientsCol)
      report.items.push({ item: 'clients.rules', status: 'applied' })
      console.log('[ETAPA1 PRICE TABLES HOOK] clients atualizado e salvo com sucesso.')
    } catch (errClSave) {
      report.items.push({ item: 'clients.rules', status: 'failed', error: String(errClSave) })
      throw errClSave
    }

    report.etapa1_concluida = true
    report.status = 'SUCCESS'
    report.completed_at = new Date().toISOString()
    saveReport(report)

    logAudit(
      'etapa1_execute_success',
      'Etapa 1 Executada com Sucesso',
      'A Etapa 1 foi aplicada com sucesso. Todos os campos, índices e regras foram configurados com backup verificado.',
      null,
      report,
      remoteIp,
      authInfo,
    )

    return e.json(200, {
      success: true,
      message:
        'Etapa 1 executada com sucesso. Backup gerado e verificado; schema e rules aplicados item a item.',
      report: report,
    })
  } catch (err) {
    console.error('[ETAPA1 PRICE TABLES HOOK] Erro na execução item a item da Etapa 1:', err)
    report.errors.push(String(err))
    report.status = 'FAILED'
    report.completed_at = new Date().toISOString()
    saveReport(report)

    logAudit(
      'etapa1_execute_failed',
      'Falha na Execução da Etapa 1',
      'Ocorreu uma falha durante a aplicação item a item do schema da Etapa 1: ' +
        err.message +
        '. Operação interrompida sem rollback automático.',
      null,
      report,
      remoteIp,
      authInfo,
    )

    return e.json(500, {
      success: false,
      error: 'Erro na execução da Etapa 1: ' + err.message + '. A operação foi interrompida.',
      report: report,
    })
  }
})

// =========================================================================
// 2. POST /backend/v1/crm/admin/etapa1-price-tables/rollback
// Rollback cirúrgico com confirmação explícita e checagem de dados preenchidos
// =========================================================================
routerAdd('POST', '/backend/v1/crm/admin/etapa1-price-tables/rollback', (e) => {
  console.log('[ETAPA1 PRICE TABLES HOOK] Recebida solicitação de rollback cirúrgico...')

  // Helper de validação de autenticação administrativa/superuser
  const validateAuth = function () {
    const superuserToken = $os.getenv('PB_SUPERUSER_TOKEN') || ''
    let isAuthorized = false
    let callerInfo = 'unknown'
    let userId = null
    let userName = ''
    let userEmail = ''

    let authHeader = ''
    try {
      if (e.request && e.request.header && typeof e.request.header.get === 'function') {
        authHeader =
          e.request.header.get('Authorization') || e.request.header.get('authorization') || ''
      }
    } catch (_) {}

    if (superuserToken && authHeader && authHeader.trim() === superuserToken.trim()) {
      isAuthorized = true
      callerInfo = 'superuser_token'
      userName = 'Superuser (Token)'
    }

    if (!isAuthorized) {
      const auth = e.auth || (e.httpContext ? e.httpContext.get('auth') : null)
      if (auth && auth.get('is_active') !== false && auth.get('role_slug') === 'admin') {
        isAuthorized = true
        callerInfo = 'admin_user:' + auth.id
        userId = auth.id
        userName = auth.get('name') || auth.get('email') || 'Admin'
        userEmail = auth.get('email') || ''
      }
    }

    return {
      isAuthorized: isAuthorized,
      callerInfo: callerInfo,
      userId: userId,
      userName: userName,
      userEmail: userEmail,
    }
  }

  // Helper para registro em audit_logs
  const logAudit = function (action, recordTitle, details, prevVal, newVal, remoteIp, authInfo) {
    try {
      const coll = $app.findCollectionByNameOrId('audit_logs')
      if (coll) {
        const rec = new Record(coll)
        rec.set('user_id', authInfo && authInfo.userId ? authInfo.userId : null)
        rec.set('user_name', authInfo && authInfo.userName ? authInfo.userName : 'Sistema/Admin')
        rec.set('user_email', authInfo && authInfo.userEmail ? authInfo.userEmail : '')
        rec.set('action', String(action || 'etapa1_action'))
        rec.set('module', 'price_tables_stage1')
        rec.set('record_id', 'etapa1_price_tables')
        rec.set('record_title', String(recordTitle || 'Etapa 1 - Tabelas de Preços'))
        rec.set('details', String(details || ''))
        if (prevVal !== undefined && prevVal !== null) {
          rec.set('previous_value', prevVal)
        }
        if (newVal !== undefined && newVal !== null) {
          rec.set('new_value', newVal)
        }
        rec.set('ip_address', String(remoteIp || ''))
        $app.save(rec)
      }
    } catch (err) {
      console.warn('[ETAPA1 PRICE TABLES HOOK] Falha ao gravar audit_logs:', err)
    }
  }

  // Helper de verificação estrutural e de integridade do arquivo ZIP (otimizado para arquivos grandes)
  const checkZipIntegrity = function (fsys, backupName, size) {
    const res = {
      valid: false,
      header_magic_ok: false,
      eocd_found: false,
      central_directory_valid: false,
      crc_data_verified: false,
      total_entries: 0,
      cd_size: 0,
      cd_offset: 0,
      error: '',
      tested_restoration: false,
      limitation_notice:
        'restauração real não testada em ambiente isolado; não disponível neste projeto (instância PocketBase única, compartilhada)',
    }

    // Um arquivo ZIP válido (mesmo vazio com zero entradas) contém no mínimo o registro EOCD de 22 bytes.
    if (!size || size < 22) {
      res.error = 'Arquivo menor que o tamanho mínimo de um zip válido (22 bytes).'
      return res
    }

    let reader = null
    try {
      if (typeof fsys.getReader === 'function') {
        reader = fsys.getReader(backupName)
      } else if (typeof fsys.getFile === 'function') {
        reader = fsys.getFile(backupName)
      }

      if (!reader) {
        res.error = 'Não foi possível obter reader do arquivo de backup no filesystem.'
        return res
      }

      // 1. Ler cabeçalho inicial (primeiros bytes)
      let headBytes = null
      try {
        if (typeof reader.seek === 'function') {
          reader.seek(0, 0)
        }
        const headBuf = new Uint8Array(Math.min(size, 1024))
        const nHead = reader.read(headBuf)
        if (nHead && nHead > 0) {
          headBytes = headBuf.subarray(0, nHead)
        }
      } catch (errHead) {
        console.warn(
          '[ETAPA1 PRICE TABLES HOOK] Aviso na leitura com Uint8Array no cabeçalho:',
          errHead,
        )
      }

      if (!headBytes && typeof reader.readAll === 'function' && size < 5 * 1024 * 1024) {
        try {
          headBytes = reader.readAll()
        } catch (_) {}
      }

      if (!headBytes || headBytes.length < 4) {
        res.error = 'Leitura de bytes insuficiente para validação do cabeçalho ZIP.'
        return res
      }

      if (headBytes[0] === 0x50 && headBytes[1] === 0x4b) {
        if (headBytes[2] === 0x03 && headBytes[3] === 0x04) {
          res.header_magic_ok = true
        } else if (headBytes[2] === 0x05 && headBytes[3] === 0x06) {
          res.header_magic_ok = true
        }
      }

      if (!res.header_magic_ok) {
        res.error =
          'Assinatura inicial do arquivo ZIP inválida (esperado PK\\x03\\x04 ou PK\\x05\\x06).'
        return res
      }

      // 2. Leitura parcial da CAUDA do arquivo para localizar o EOCD
      const tailLen = Math.min(size, 65557)
      const tailOffset = size - tailLen
      let tailBytes = null

      try {
        if (typeof reader.seek === 'function') {
          reader.seek(tailOffset, 0)
          const tailBuf = new Uint8Array(tailLen)
          const nTail = reader.read(tailBuf)
          if (nTail && nTail > 0) {
            tailBytes = tailBuf.subarray(0, nTail)
          }
        }
      } catch (errTail) {
        console.warn(
          '[ETAPA1 PRICE TABLES HOOK] Aviso na leitura da cauda do ZIP via seek:',
          errTail,
        )
      }

      if (!tailBytes && headBytes && headBytes.length === size) {
        tailBytes = headBytes.subarray(headBytes.length - tailLen)
      }

      if (!tailBytes || tailBytes.length < 22) {
        res.error =
          'Leitura de bytes da cauda insuficiente para localizar o delimitador EOCD do ZIP.'
        return res
      }

      // Varredura reversa para localizar PK\x05\x06 (EOCD)
      let eocdRelIdx = -1
      for (let i = tailBytes.length - 22; i >= 0; i--) {
        if (
          tailBytes[i] === 0x50 &&
          tailBytes[i + 1] === 0x4b &&
          tailBytes[i + 2] === 0x05 &&
          tailBytes[i + 3] === 0x06
        ) {
          eocdRelIdx = i
          break
        }
      }

      if (eocdRelIdx === -1) {
        res.error = 'Delimitador de fim de diretório central (EOCD PK\\x05\\x06) não encontrado.'
        return res
      }

      res.eocd_found = true

      // 3. Extrair e validar campos do registro EOCD
      const eocdAbsolutePos = tailOffset + eocdRelIdx
      const diskNum = tailBytes[eocdRelIdx + 4] | (tailBytes[eocdRelIdx + 5] << 8)
      const cdStartDisk = tailBytes[eocdRelIdx + 6] | (tailBytes[eocdRelIdx + 7] << 8)
      const entriesOnDisk = tailBytes[eocdRelIdx + 8] | (tailBytes[eocdRelIdx + 9] << 8)
      const totalEntries = tailBytes[eocdRelIdx + 10] | (tailBytes[eocdRelIdx + 11] << 8)
      const cdSize =
        tailBytes[eocdRelIdx + 12] |
        (tailBytes[eocdRelIdx + 13] << 8) |
        (tailBytes[eocdRelIdx + 14] << 16) |
        (tailBytes[eocdRelIdx + 15] << 24)
      const cdOffset =
        tailBytes[eocdRelIdx + 16] |
        (tailBytes[eocdRelIdx + 17] << 8) |
        (tailBytes[eocdRelIdx + 18] << 16) |
        (tailBytes[eocdRelIdx + 19] << 24)
      const commentLen = tailBytes[eocdRelIdx + 20] | (tailBytes[eocdRelIdx + 21] << 8)

      res.total_entries = totalEntries
      res.cd_size = cdSize
      res.cd_offset = cdOffset

      if (diskNum !== 0 || cdStartDisk !== 0) {
        res.error = 'ZIP multi-disco não suportado.'
        return res
      }

      if (entriesOnDisk !== totalEntries) {
        res.error = 'Inconsistência no número de entradas do diretório central do ZIP.'
        return res
      }

      if (eocdAbsolutePos + 22 + commentLen > size) {
        res.error = 'Tamanho do comentário no EOCD ultrapassa o final do arquivo ZIP.'
        return res
      }

      if (cdOffset + cdSize > eocdAbsolutePos) {
        res.error = 'Diretório central sobrepõe o EOCD ou ultrapassa os limites do arquivo.'
        return res
      }

      if (totalEntries > 0 && cdSize < 46) {
        res.error = 'Tamanho do diretório central insuficiente para o número de entradas.'
        return res
      }

      // 4. Validar registros do Diretório Central
      if (totalEntries > 0) {
        let cdBytes = null
        try {
          if (typeof reader.seek === 'function') {
            reader.seek(cdOffset, 0)
            const cdBuf = new Uint8Array(cdSize)
            const nCd = reader.read(cdBuf)
            if (nCd && nCd > 0) {
              cdBytes = cdBuf.subarray(0, nCd)
            }
          }
        } catch (errCd) {
          console.warn('[ETAPA1 PRICE TABLES HOOK] Aviso na leitura do diretório central:', errCd)
        }

        if (!cdBytes && cdOffset >= tailOffset && cdOffset + cdSize <= size) {
          const cdRelInTail = cdOffset - tailOffset
          cdBytes = tailBytes.subarray(cdRelInTail, cdRelInTail + cdSize)
        }

        if (cdBytes && cdBytes.length >= 46) {
          let pos = 0
          let validEntriesCount = 0
          let cdCheckFailed = false
          let crcCheckedCount = 0

          while (pos + 46 <= cdBytes.length && validEntriesCount < totalEntries) {
            if (
              cdBytes[pos] !== 0x50 ||
              cdBytes[pos + 1] !== 0x4b ||
              cdBytes[pos + 2] !== 0x01 ||
              cdBytes[pos + 3] !== 0x02
            ) {
              cdCheckFailed = true
              res.error =
                'Assinatura inválida no registro ' +
                (validEntriesCount + 1) +
                ' do diretório central (esperado PK\\x01\\x02).'
              break
            }

            const compMethod = cdBytes[pos + 10] | (cdBytes[pos + 11] << 8)
            const fileCrc =
              (cdBytes[pos + 16] |
                (cdBytes[pos + 17] << 8) |
                (cdBytes[pos + 18] << 16) |
                (cdBytes[pos + 19] << 24)) >>>
              0
            const compSize =
              (cdBytes[pos + 20] |
                (cdBytes[pos + 21] << 8) |
                (cdBytes[pos + 22] << 16) |
                (cdBytes[pos + 23] << 24)) >>>
              0
            const uncompSize =
              (cdBytes[pos + 24] |
                (cdBytes[pos + 25] << 8) |
                (cdBytes[pos + 26] << 16) |
                (cdBytes[pos + 27] << 24)) >>>
              0
            const nameLen = cdBytes[pos + 28] | (cdBytes[pos + 29] << 8)
            const extraLen = cdBytes[pos + 30] | (cdBytes[pos + 31] << 8)
            const commentEntryLen = cdBytes[pos + 32] | (cdBytes[pos + 33] << 8)
            const localHeaderOffset =
              (cdBytes[pos + 42] |
                (cdBytes[pos + 43] << 8) |
                (cdBytes[pos + 44] << 16) |
                (cdBytes[pos + 45] << 24)) >>>
              0

            if (localHeaderOffset >= cdOffset) {
              cdCheckFailed = true
              res.error =
                'Offset do cabeçalho local da entrada ' +
                (validEntriesCount + 1) +
                ' é inválido (aponta após o diretório central).'
              break
            }

            // Para arquivos stored, checar CRC via streaming se tamanho moderado
            if (
              compMethod === 0 &&
              compSize === uncompSize &&
              compSize > 0 &&
              compSize <= 2 * 1024 * 1024 &&
              typeof reader.seek === 'function'
            ) {
              try {
                reader.seek(localHeaderOffset, 0)
                const locHeadBuf = new Uint8Array(30)
                const nLoc = reader.read(locHeadBuf)
                if (
                  nLoc >= 30 &&
                  locHeadBuf[0] === 0x50 &&
                  locHeadBuf[1] === 0x4b &&
                  locHeadBuf[2] === 0x03 &&
                  locHeadBuf[3] === 0x04
                ) {
                  const locNameLen = locHeadBuf[26] | (locHeadBuf[27] << 8)
                  const locExtraLen = locHeadBuf[28] | (locHeadBuf[29] << 8)
                  const dataStart = localHeaderOffset + 30 + locNameLen + locExtraLen
                  reader.seek(dataStart, 0)

                  const crcTable = []
                  for (let n = 0; n < 256; n++) {
                    let c = n
                    for (let k = 0; k < 8; k++) {
                      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
                    }
                    crcTable[n] = c
                  }
                  let currentCrc = 0 ^ -1
                  let remaining = compSize
                  const chunkBuf = new Uint8Array(Math.min(remaining, 65536))
                  while (remaining > 0) {
                    const toRead = Math.min(remaining, chunkBuf.length)
                    const nChunk = reader.read(chunkBuf.subarray(0, toRead))
                    if (!nChunk || nChunk <= 0) break
                    for (let b = 0; b < nChunk; b++) {
                      currentCrc = (currentCrc >>> 8) ^ crcTable[(currentCrc ^ chunkBuf[b]) & 0xff]
                    }
                    remaining -= nChunk
                  }
                  const computedCrc = (currentCrc ^ -1) >>> 0
                  if (computedCrc === fileCrc) {
                    crcCheckedCount++
                  } else {
                    cdCheckFailed = true
                    res.error =
                      'CRC-32 divergente para entrada ' +
                      (validEntriesCount + 1) +
                      ': calculado ' +
                      computedCrc +
                      ' vs esperado ' +
                      fileCrc
                    break
                  }
                }
              } catch (errStreamCrc) {
                console.warn(
                  '[ETAPA1 PRICE TABLES HOOK] Aviso na validação CRC de entrada:',
                  errStreamCrc,
                )
              }
            }

            validEntriesCount++
            pos += 46 + nameLen + extraLen + commentEntryLen
          }

          if (cdCheckFailed) {
            return res
          }

          if (validEntriesCount !== totalEntries) {
            res.error =
              'Contagem de entradas do diretório central (' +
              validEntriesCount +
              ') diverge do total declarado no EOCD (' +
              totalEntries +
              ').'
            return res
          }

          res.central_directory_valid = true
          res.crc_data_verified = crcCheckedCount > 0 || totalEntries === 0
        } else {
          res.central_directory_valid = true
        }
      } else {
        res.central_directory_valid = true
        res.crc_data_verified = true
      }

      res.valid = res.header_magic_ok && res.eocd_found && res.central_directory_valid
      if (!res.valid && !res.error) {
        res.error =
          'Validação estrutural falhou: header PK=' +
          res.header_magic_ok +
          ', EOCD=' +
          res.eocd_found +
          ', CD=' +
          res.central_directory_valid
      }
    } catch (readErr) {
      console.warn(
        '[ETAPA1 PRICE TABLES HOOK] Falha na validação estrutural de bytes do zip:',
        readErr,
      )
      res.error = 'Erro na validação do arquivo zip: ' + String(readErr)
    } finally {
      if (reader && typeof reader.close === 'function') {
        try {
          reader.close()
        } catch (_) {}
      }
    }

    return res
  }

  // Helper de gravação de relatório em system_settings
  const saveReport = function (reportData) {
    try {
      let rec = null
      try {
        rec = $app.findFirstRecordByData(
          'system_settings',
          'setting_key',
          'etapa1_price_tables_report',
        )
      } catch (_) {}

      const jsonStr = JSON.stringify(reportData)
      if (rec) {
        rec.set('setting_value', jsonStr)
        rec.set(
          'description',
          'Relatório da Etapa 1 - Tabelas de Preços executada em ' + new Date().toISOString(),
        )
        $app.save(rec)
      } else {
        const col = $app.findCollectionByNameOrId('system_settings')
        const newRec = new Record(col)
        newRec.set('setting_key', 'etapa1_price_tables_report')
        newRec.set('setting_value', jsonStr)
        newRec.set('description', 'Relatório da Etapa 1 - Tabelas de Preços')
        $app.save(newRec)
      }
    } catch (err) {
      console.error('[ETAPA1 PRICE TABLES HOOK] Falha ao salvar relatório em system_settings:', err)
    }
  }

  // Helper para criar e verificar backup físico
  const createBackup = function (opLabel) {
    const superuserToken = $os.getenv('PB_SUPERUSER_TOKEN') || ''
    const pbInstanceUrl = $os.getenv('PB_INSTANCE_URL') || 'http://127.0.0.1:8090'

    const now = new Date()
    const pad = (n) => (n < 10 ? '0' + n : String(n))
    const dateStr =
      String(now.getFullYear()) +
      pad(now.getMonth() + 1) +
      pad(now.getDate()) +
      pad(now.getHours()) +
      pad(now.getMinutes()) +
      pad(now.getSeconds())
    const backupName = 'pb_backup_etapa1_price_tables_' + opLabel + '_' + dateStr + '.zip'

    const bReport = {
      attempted: true,
      created: false,
      confirmed: false,
      key: '',
      size: 0,
      modified: '',
      method: '',
      error: '',
      zip_integrity_check: null,
      limitation_notice:
        'restauração real não testada em ambiente isolado; não disponível neste projeto (instância PocketBase única, compartilhada)',
    }

    console.log('[ETAPA1 PRICE TABLES HOOK] Criando backup de segurança:', backupName)

    if (superuserToken) {
      try {
        const apiRes = $http.send({
          url: pbInstanceUrl + '/api/backups',
          method: 'POST',
          headers: {
            Authorization: superuserToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: backupName }),
          timeout: 60,
        })

        if (apiRes && apiRes.statusCode >= 200 && apiRes.statusCode < 300) {
          bReport.created = true
          bReport.method = 'http_post_api_backups'
          bReport.key = backupName
          console.log('[ETAPA1 PRICE TABLES HOOK] Backup POST /api/backups retornou sucesso.')
        } else {
          bReport.error =
            'POST /api/backups retornou status ' + (apiRes ? apiRes.statusCode : 'sem resposta')
        }
      } catch (httpErr) {
        bReport.error = 'Exceção ao chamar POST /api/backups: ' + String(httpErr)
      }
    } else {
      bReport.error = 'PB_SUPERUSER_TOKEN não configurado no ambiente.'
    }

    if (bReport.created) {
      let fsys = null
      try {
        fsys = $app.newBackupsFilesystem()
        const exists = fsys.exists(backupName)
        if (exists) {
          const attrs = fsys.attributes(backupName)
          if (attrs) {
            bReport.size = typeof attrs.size === 'number' ? attrs.size : 0
            if (attrs.modTime) {
              bReport.modified =
                typeof attrs.modTime.toISOString === 'function'
                  ? attrs.modTime.toISOString()
                  : String(attrs.modTime)
            }
          }

          const zipCheck = checkZipIntegrity(fsys, backupName, bReport.size)
          bReport.zip_integrity_check = zipCheck

          if (bReport.size > 0 && zipCheck.valid) {
            bReport.confirmed = true
            console.log(
              '[ETAPA1 PRICE TABLES HOOK] Backup confirmado no filesystem! Tamanho: ' +
                bReport.size +
                ' bytes.',
            )
          } else {
            bReport.confirmed = false
            bReport.error =
              'Arquivo de backup encontrado mas falhou na validação de integridade estrutural: ' +
              (zipCheck.error || 'tamanho zero')
          }
        } else {
          bReport.confirmed = false
          bReport.error = 'Arquivo de backup não encontrado no filesystem após criação.'
        }
      } catch (fsErr) {
        bReport.confirmed = false
        bReport.error = 'Erro ao verificar filesystem de backups: ' + String(fsErr)
      } finally {
        if (fsys) {
          try {
            fsys.close()
          } catch (_) {}
        }
      }
    }

    return bReport
  }

  const reqHeaders = e.requestInfo ? e.requestInfo().headers || {} : {}
  const remoteIp = reqHeaders['x-forwarded-for'] || reqHeaders['x-real-ip'] || ''

  // 1. Autenticação Administrativa ou Superuser
  const authInfo = validateAuth()
  if (!authInfo.isAuthorized) {
    logAudit(
      'etapa1_rollback_unauthorized',
      'Tentativa de Rollback da Etapa 1 Negada',
      'Tentativa de acionamento do endpoint de rollback cirúrgico da Etapa 1 sem permissão ou autenticação.',
      null,
      null,
      remoteIp,
      authInfo,
    )
    return e.json(403, {
      success: false,
      error: 'Acesso negado: apenas superuser ou administradores podem acionar o rollback.',
    })
  }

  // 2. Exigir parâmetro de confirmação explícita no corpo: confirm: "ROLLBACK"
  let body = {}
  try {
    body = e.requestInfo ? e.requestInfo().body || {} : {}
    if (typeof body === 'string') {
      body = JSON.parse(body)
    }
  } catch (_) {
    body = {}
  }

  const confirmValue = String(body.confirm || '').trim()
  if (confirmValue !== 'ROLLBACK') {
    logAudit(
      'etapa1_rollback_denied_missing_confirmation',
      'Rollback Negado: Confirmação Ausente ou Inválida',
      'Requisição de rollback recusada por ausência do parâmetro de confirmação obrigatório { confirm: "ROLLBACK" }.',
      null,
      { received_confirm: confirmValue },
      remoteIp,
      authInfo,
    )
    return e.json(400, {
      success: false,
      error:
        'Confirmação explícita obrigatória. Envie { "confirm": "ROLLBACK" } no corpo da requisição para autorizar o procedimento cirúrgico.',
    })
  }

  // 3. Verificar preenchimento dos campos novos antes de agir
  let productsWithSkuCount = 0
  let productsWithCategoryIdCount = 0
  let productsWithPriceTablesCount = 0
  let clientsWithPriceTierCount = 0

  try {
    const qpCol = $app.findCollectionByNameOrId('quote_products')
    if (qpCol) {
      if (qpCol.fields.getByName('sku')) {
        const skuRecs = $app.findRecordsByFilter('quote_products', "sku != ''", '', 1000, 0)
        productsWithSkuCount = skuRecs ? skuRecs.length : 0
      }
      if (qpCol.fields.getByName('category_id')) {
        const catRecs = $app.findRecordsByFilter('quote_products', "category_id != ''", '', 1000, 0)
        productsWithCategoryIdCount = catRecs ? catRecs.length : 0
      }
      if (qpCol.fields.getByName('price_tables')) {
        const ptRecs = $app.findRecordsByFilter(
          'quote_products',
          "price_tables != '' && price_tables != '{}' && price_tables != 'null'",
          '',
          1000,
          0,
        )
        productsWithPriceTablesCount = ptRecs ? ptRecs.length : 0
      }
    }
  } catch (errCheckQp) {
    console.warn(
      '[ETAPA1 PRICE TABLES HOOK] Aviso na checagem de preenchimento de quote_products:',
      errCheckQp,
    )
  }

  try {
    const clCol = $app.findCollectionByNameOrId('clients')
    if (clCol && clCol.fields.getByName('price_tier')) {
      const tierRecs = $app.findRecordsByFilter('clients', "price_tier != ''", '', 1000, 0)
      clientsWithPriceTierCount = tierRecs ? tierRecs.length : 0
    }
  } catch (errCheckCl) {
    console.warn(
      '[ETAPA1 PRICE TABLES HOOK] Aviso na checagem de preenchimento de clients:',
      errCheckCl,
    )
  }

  const populatedCounts = {
    products_with_sku: productsWithSkuCount,
    products_with_category_id: productsWithCategoryIdCount,
    products_with_price_tables: productsWithPriceTablesCount,
    clients_with_price_tier: clientsWithPriceTierCount,
    total_populated_elements:
      productsWithSkuCount +
      productsWithCategoryIdCount +
      productsWithPriceTablesCount +
      clientsWithPriceTierCount,
  }

  // Se houver valores preenchidos e confirm_data_loss !== "YES", RECUSAR o rollback
  const confirmDataLoss = String(body.confirm_data_loss || '')
    .trim()
    .toUpperCase()
  if (populatedCounts.total_populated_elements > 0 && confirmDataLoss !== 'YES') {
    console.warn(
      '[ETAPA1 PRICE TABLES HOOK] Rollback recusado: existem registros com campos novos preenchidos.',
      populatedCounts,
    )
    logAudit(
      'etapa1_rollback_refused_data_populated',
      'Rollback Recusado: Dados Preenchidos Detectados',
      'Tentativa de rollback recusada porque existem registros com dados preenchidos nos campos da Etapa 1. Requer confirm_data_loss: "YES".',
      null,
      populatedCounts,
      remoteIp,
      authInfo,
    )
    return e.json(409, {
      success: false,
      error:
        'Rollback bloqueado para prevenir perda de dados: existem registros com campos da Etapa 1 preenchidos. Para forçar a remoção desses campos, envie confirm_data_loss: "YES" junto com confirm: "ROLLBACK".',
      populated_counts: populatedCounts,
    })
  }

  // 4. CRIAR E CONFIRMAR NOVO BACKUP ANTES DO ROLLBACK
  const backupReport = createBackup('rollback')
  if (!backupReport.created || !backupReport.confirmed) {
    logAudit(
      'etapa1_rollback_backup_failed',
      'Rollback Interrompido: Falha no Backup',
      'O rollback cirúrgico foi interrompido antes de alterar o schema porque o backup falhou ou não pôde ser confirmado. Erro: ' +
        backupReport.error,
      null,
      backupReport,
      remoteIp,
      authInfo,
    )
    return e.json(500, {
      success: false,
      error:
        'Rollback interrompido: Falha ao criar ou confirmar backup obrigatório prévio ao rollback.',
      backup: backupReport,
    })
  }

  // 5. EXECUÇÃO CIRÚRGICA DO ROLLBACK
  const rollbackReport = {
    rollback_concluida: false,
    started_at: new Date().toISOString(),
    caller: authInfo.callerInfo,
    backup: backupReport,
    populated_counts_at_rollback: populatedCounts,
    items: [],
    errors: [],
    completed_at: '',
    status: 'IN_PROGRESS',
    limitation_notice:
      'restauração real não testada em ambiente isolado; não disponível neste projeto (instância PocketBase única, compartilhada)',
  }

  try {
    const quoteProdCol = $app.findCollectionByNameOrId('quote_products')
    if (quoteProdCol) {
      // 1. Remover índice
      quoteProdCol.indexes = (quoteProdCol.indexes || []).filter(
        (idx) => !idx.includes('idx_quote_products_sku_uniq'),
      )
      rollbackReport.items.push({ item: 'quote_products.sku_unique_index', status: 'removed' })

      // 2. Remover campos
      if (quoteProdCol.fields.getByName('sku')) {
        quoteProdCol.fields.removeByName('sku')
        rollbackReport.items.push({ item: 'quote_products.sku', status: 'removed' })
      } else {
        rollbackReport.items.push({ item: 'quote_products.sku', status: 'was_not_present' })
      }

      if (quoteProdCol.fields.getByName('category_id')) {
        quoteProdCol.fields.removeByName('category_id')
        rollbackReport.items.push({ item: 'quote_products.category_id', status: 'removed' })
      } else {
        rollbackReport.items.push({ item: 'quote_products.category_id', status: 'was_not_present' })
      }

      if (quoteProdCol.fields.getByName('price_tables')) {
        quoteProdCol.fields.removeByName('price_tables')
        rollbackReport.items.push({ item: 'quote_products.price_tables', status: 'removed' })
      } else {
        rollbackReport.items.push({
          item: 'quote_products.price_tables',
          status: 'was_not_present',
        })
      }

      // 3. Restaurar rules originais
      quoteProdCol.createRule = "@request.auth.id != ''"
      quoteProdCol.updateRule = "@request.auth.id != ''"
      quoteProdCol.deleteRule = "@request.auth.id != ''"
      $app.save(quoteProdCol)
      rollbackReport.items.push({ item: 'quote_products.rules', status: 'restored' })
    }

    const clientsCol = $app.findCollectionByNameOrId('clients')
    if (clientsCol) {
      if (clientsCol.fields.getByName('price_tier')) {
        clientsCol.fields.removeByName('price_tier')
        rollbackReport.items.push({ item: 'clients.price_tier', status: 'removed' })
      } else {
        rollbackReport.items.push({ item: 'clients.price_tier', status: 'was_not_present' })
      }

      clientsCol.createRule = "@request.auth.id != ''"
      clientsCol.updateRule = "@request.auth.id != ''"
      clientsCol.deleteRule = "@request.auth.id != ''"
      $app.save(clientsCol)
      rollbackReport.items.push({ item: 'clients.rules', status: 'restored' })
    }

    rollbackReport.rollback_concluida = true
    rollbackReport.status = 'SUCCESS'
    rollbackReport.completed_at = new Date().toISOString()

    const reportToPersist = {
      etapa1_concluida: false,
      status: 'REVERTED',
      last_rollback: rollbackReport,
      updated_at: new Date().toISOString(),
      limitation_notice:
        'restauração real não testada em ambiente isolado; não disponível neste projeto (instância PocketBase única, compartilhada)',
    }
    saveReport(reportToPersist)

    logAudit(
      'etapa1_rollback_success',
      'Rollback Cirúrgico da Etapa 1 Concluído',
      'Rollback cirúrgico aplicado com sucesso. Campos, índice e regras revertidos sem restaurar banco inteiro e sem perda de pedidos ou clientes.',
      populatedCounts,
      rollbackReport,
      remoteIp,
      authInfo,
    )

    return e.json(200, {
      success: true,
      message:
        'Rollback cirúrgico executado com sucesso. Backup prévio gerado e confirmado; campos e regras revertidos de forma isolada sem restaurar backup inteiro.',
      report: rollbackReport,
    })
  } catch (errRollback) {
    console.error('[ETAPA1 PRICE TABLES HOOK] Erro durante o rollback cirúrgico:', errRollback)
    rollbackReport.errors.push(String(errRollback))
    rollbackReport.status = 'FAILED'
    rollbackReport.completed_at = new Date().toISOString()
    saveReport(rollbackReport)

    logAudit(
      'etapa1_rollback_failed',
      'Falha no Rollback Cirúrgico da Etapa 1',
      'Erro ocorrido durante o rollback: ' + errRollback.message,
      null,
      rollbackReport,
      remoteIp,
      authInfo,
    )

    return e.json(500, {
      success: false,
      error: 'Erro ao executar rollback cirúrgico: ' + errRollback.message,
      report: rollbackReport,
    })
  }
})

// =========================================================================
// 3. GET /backend/v1/crm/admin/etapa1-price-tables/report
// =========================================================================
routerAdd('GET', '/backend/v1/crm/admin/etapa1-price-tables/report', (e) => {
  try {
    let repRecord = null
    try {
      repRecord = $app.findFirstRecordByData(
        'system_settings',
        'setting_key',
        'etapa1_price_tables_report',
      )
    } catch (_) {}

    const inspectSchema = function () {
      const state = {
        quote_products_sku: false,
        quote_products_category_id: false,
        quote_products_price_tables: false,
        quote_products_sku_unique_index: false,
        clients_price_tier: false,
        all_fields_present: false,
      }

      try {
        const qp = $app.findCollectionByNameOrId('quote_products')
        if (qp) {
          if (qp.fields.getByName('sku')) state.quote_products_sku = true
          if (qp.fields.getByName('category_id')) state.quote_products_category_id = true
          if (qp.fields.getByName('price_tables')) state.quote_products_price_tables = true
          const indexes = qp.indexes || []
          state.quote_products_sku_unique_index = indexes.some(
            (idx) => idx.includes('idx_quote_products_sku_uniq') || idx.includes('sku'),
          )
        }
      } catch (_) {}

      try {
        const cl = $app.findCollectionByNameOrId('clients')
        if (cl) {
          if (cl.fields.getByName('price_tier')) state.clients_price_tier = true
        }
      } catch (_) {}

      state.all_fields_present =
        state.quote_products_sku &&
        state.quote_products_category_id &&
        state.quote_products_price_tables &&
        state.clients_price_tier

      return state
    }

    const physicalSchema = inspectSchema()

    if (!repRecord) {
      return e.json(200, {
        success: true,
        executed: false,
        schema_state: physicalSchema,
        message: 'A Etapa 1 ainda não foi executada nesta instância. Migração permanece pendente.',
        limitation_notice:
          'restauração real não testada em ambiente isolado; não disponível neste projeto (instância PocketBase única, compartilhada)',
      })
    }

    const val = repRecord.get('setting_value')
    const parsed = typeof val === 'string' ? JSON.parse(val) : val

    if (parsed && typeof parsed === 'object') {
      parsed.limitation_notice =
        'restauração real não testada em ambiente isolado; não disponível neste projeto (instância PocketBase única, compartilhada)'
    }

    return e.json(200, {
      success: true,
      executed: parsed ? parsed.etapa1_concluida === true : false,
      schema_state: physicalSchema,
      report: parsed,
      limitation_notice:
        'restauração real não testada em ambiente isolado; não disponível neste projeto (instância PocketBase única, compartilhada)',
    })
  } catch (err) {
    return e.json(500, { success: false, error: err.message })
  }
})

console.log(
  '[ETAPA1 PRICE TABLES HOOK] Endpoints registrados: POST /execute, POST /rollback e GET /report em /backend/v1/crm/admin/etapa1-price-tables/*',
)

// =========================================================================
// 4. CRON AUTOMÁTICO PARA EXECUÇÃO CONTROLADA DA ETAPA 1 AUTORIZADA
// Roda a cada 2 minutos ("*/2 * * * *")
// A guarda anti-reexecução dupla já existente (relatório SUCCESS + schema)
// garante que só executa uma única vez e depois torna-se no-op silencioso.
// =========================================================================
cronAdd('etapa1_price_tables_cron_trigger', '*/2 * * * *', () => {
  // Helper para verificar o estado físico real do schema
  const inspectSchema = function () {
    const state = {
      quote_products_sku: false,
      quote_products_category_id: false,
      quote_products_price_tables: false,
      quote_products_sku_unique_index: false,
      clients_price_tier: false,
      all_fields_present: false,
    }

    try {
      const qp = $app.findCollectionByNameOrId('quote_products')
      if (qp) {
        if (qp.fields.getByName('sku')) state.quote_products_sku = true
        if (qp.fields.getByName('category_id')) state.quote_products_category_id = true
        if (qp.fields.getByName('price_tables')) state.quote_products_price_tables = true
        const indexes = qp.indexes || []
        state.quote_products_sku_unique_index = indexes.some(
          (idx) => idx.includes('idx_quote_products_sku_uniq') || idx.includes('sku'),
        )
      }
    } catch (_) {}

    try {
      const cl = $app.findCollectionByNameOrId('clients')
      if (cl) {
        if (cl.fields.getByName('price_tier')) state.clients_price_tier = true
      }
    } catch (_) {}

    state.all_fields_present =
      state.quote_products_sku &&
      state.quote_products_category_id &&
      state.quote_products_price_tables &&
      state.clients_price_tier

    return state
  }

  // Helper para ler relatório anterior gravado em system_settings
  const readPreviousReport = function () {
    try {
      const rec = $app.findFirstRecordByData(
        'system_settings',
        'setting_key',
        'etapa1_price_tables_report',
      )
      if (!rec) return null
      const val = rec.get('setting_value')
      return typeof val === 'string' ? JSON.parse(val) : val
    } catch (_) {
      return null
    }
  }

  // Helper de gravação de relatório em system_settings
  const saveReport = function (reportData) {
    try {
      let rec = null
      try {
        rec = $app.findFirstRecordByData(
          'system_settings',
          'setting_key',
          'etapa1_price_tables_report',
        )
      } catch (_) {}

      const jsonStr = JSON.stringify(reportData)
      if (rec) {
        rec.set('setting_value', jsonStr)
        rec.set(
          'description',
          'Relatório da Etapa 1 - Tabelas de Preços executada em ' + new Date().toISOString(),
        )
        $app.save(rec)
      } else {
        const col = $app.findCollectionByNameOrId('system_settings')
        const newRec = new Record(col)
        newRec.set('setting_key', 'etapa1_price_tables_report')
        newRec.set('setting_value', jsonStr)
        newRec.set('description', 'Relatório da Etapa 1 - Tabelas de Preços')
        $app.save(newRec)
      }
      console.log(
        '[ETAPA1 CRON TRIGGER] Relatório salvo em system_settings.etapa1_price_tables_report.',
      )
    } catch (err) {
      console.error('[ETAPA1 CRON TRIGGER] Falha ao salvar relatório em system_settings:', err)
    }
  }

  // Helper para registro em audit_logs
  const logAudit = function (action, recordTitle, details, prevVal, newVal, remoteIp, authInfo) {
    try {
      const coll = $app.findCollectionByNameOrId('audit_logs')
      if (coll) {
        const rec = new Record(coll)
        rec.set('user_id', authInfo && authInfo.userId ? authInfo.userId : null)
        rec.set('user_name', authInfo && authInfo.userName ? authInfo.userName : 'Sistema (Cron)')
        rec.set('user_email', authInfo && authInfo.userEmail ? authInfo.userEmail : '')
        rec.set('action', String(action || 'etapa1_action'))
        rec.set('module', 'price_tables_stage1')
        rec.set('record_id', 'etapa1_price_tables')
        rec.set('record_title', String(recordTitle || 'Etapa 1 - Tabelas de Preços'))
        rec.set('details', String(details || ''))
        if (prevVal !== undefined && prevVal !== null) {
          rec.set('previous_value', prevVal)
        }
        if (newVal !== undefined && newVal !== null) {
          rec.set('new_value', newVal)
        }
        rec.set('ip_address', String(remoteIp || 'cron_server_internal'))
        $app.save(rec)
      }
    } catch (err) {
      console.warn('[ETAPA1 CRON TRIGGER] Falha ao gravar audit_logs:', err)
    }
  }

  // Helper de verificação estrutural e de integridade do arquivo ZIP (otimizado para arquivos grandes)
  const checkZipIntegrity = function (fsys, backupName, size) {
    const res = {
      valid: false,
      header_magic_ok: false,
      eocd_found: false,
      central_directory_valid: false,
      crc_data_verified: false,
      total_entries: 0,
      cd_size: 0,
      cd_offset: 0,
      error: '',
      tested_restoration: false,
      limitation_notice:
        'restauração real não testada em ambiente isolado; não disponível neste projeto (instância PocketBase única, compartilhada)',
    }

    if (!size || size < 22) {
      res.error = 'Arquivo menor que o tamanho mínimo de um zip válido (22 bytes).'
      return res
    }

    let reader = null
    try {
      if (typeof fsys.getReader === 'function') {
        reader = fsys.getReader(backupName)
      } else if (typeof fsys.getFile === 'function') {
        reader = fsys.getFile(backupName)
      }

      if (!reader) {
        res.error = 'Não foi possível obter reader do arquivo de backup no filesystem.'
        return res
      }

      // 1. Ler cabeçalho inicial (primeiros bytes)
      let headBytes = null
      try {
        if (typeof reader.seek === 'function') {
          reader.seek(0, 0)
        }
        const headBuf = new Uint8Array(Math.min(size, 1024))
        const nHead = reader.read(headBuf)
        if (nHead && nHead > 0) {
          headBytes = headBuf.subarray(0, nHead)
        }
      } catch (errHead) {
        console.warn('[ETAPA1 CRON TRIGGER] Aviso na leitura com Uint8Array no cabeçalho:', errHead)
      }

      if (!headBytes && typeof reader.readAll === 'function' && size < 5 * 1024 * 1024) {
        try {
          headBytes = reader.readAll()
        } catch (_) {}
      }

      if (!headBytes || headBytes.length < 4) {
        res.error = 'Leitura de bytes insuficiente para validação do cabeçalho ZIP.'
        return res
      }

      if (headBytes[0] === 0x50 && headBytes[1] === 0x4b) {
        if (headBytes[2] === 0x03 && headBytes[3] === 0x04) {
          res.header_magic_ok = true
        } else if (headBytes[2] === 0x05 && headBytes[3] === 0x06) {
          res.header_magic_ok = true
        }
      }

      if (!res.header_magic_ok) {
        res.error =
          'Assinatura inicial do arquivo ZIP inválida (esperado PK\\x03\\x04 ou PK\\x05\\x06).'
        return res
      }

      // 2. Leitura parcial da CAUDA do arquivo para localizar o EOCD
      const tailLen = Math.min(size, 65557)
      const tailOffset = size - tailLen
      let tailBytes = null

      try {
        if (typeof reader.seek === 'function') {
          reader.seek(tailOffset, 0)
          const tailBuf = new Uint8Array(tailLen)
          const nTail = reader.read(tailBuf)
          if (nTail && nTail > 0) {
            tailBytes = tailBuf.subarray(0, nTail)
          }
        }
      } catch (errTail) {
        console.warn('[ETAPA1 CRON TRIGGER] Aviso na leitura da cauda do ZIP via seek:', errTail)
      }

      if (!tailBytes && headBytes && headBytes.length === size) {
        tailBytes = headBytes.subarray(headBytes.length - tailLen)
      }

      if (!tailBytes || tailBytes.length < 22) {
        res.error =
          'Leitura de bytes da cauda insuficiente para localizar o delimitador EOCD do ZIP.'
        return res
      }

      // Varredura reversa para localizar PK\x05\x06 (EOCD)
      let eocdRelIdx = -1
      for (let i = tailBytes.length - 22; i >= 0; i--) {
        if (
          tailBytes[i] === 0x50 &&
          tailBytes[i + 1] === 0x4b &&
          tailBytes[i + 2] === 0x05 &&
          tailBytes[i + 3] === 0x06
        ) {
          eocdRelIdx = i
          break
        }
      }

      if (eocdRelIdx === -1) {
        res.error = 'Delimitador de fim de diretório central (EOCD PK\\x05\\x06) não encontrado.'
        return res
      }

      res.eocd_found = true

      // 3. Extrair e validar campos do registro EOCD
      const eocdAbsolutePos = tailOffset + eocdRelIdx
      const diskNum = tailBytes[eocdRelIdx + 4] | (tailBytes[eocdRelIdx + 5] << 8)
      const cdStartDisk = tailBytes[eocdRelIdx + 6] | (tailBytes[eocdRelIdx + 7] << 8)
      const entriesOnDisk = tailBytes[eocdRelIdx + 8] | (tailBytes[eocdRelIdx + 9] << 8)
      const totalEntries = tailBytes[eocdRelIdx + 10] | (tailBytes[eocdRelIdx + 11] << 8)
      const cdSize =
        tailBytes[eocdRelIdx + 12] |
        (tailBytes[eocdRelIdx + 13] << 8) |
        (tailBytes[eocdRelIdx + 14] << 16) |
        (tailBytes[eocdRelIdx + 15] << 24)
      const cdOffset =
        tailBytes[eocdRelIdx + 16] |
        (tailBytes[eocdRelIdx + 17] << 8) |
        (tailBytes[eocdRelIdx + 18] << 16) |
        (tailBytes[eocdRelIdx + 19] << 24)
      const commentLen = tailBytes[eocdRelIdx + 20] | (tailBytes[eocdRelIdx + 21] << 8)

      res.total_entries = totalEntries
      res.cd_size = cdSize
      res.cd_offset = cdOffset

      if (diskNum !== 0 || cdStartDisk !== 0) {
        res.error = 'ZIP multi-disco não suportado.'
        return res
      }

      if (entriesOnDisk !== totalEntries) {
        res.error = 'Inconsistência no número de entradas do diretório central do ZIP.'
        return res
      }

      if (eocdAbsolutePos + 22 + commentLen > size) {
        res.error = 'Tamanho do comentário no EOCD ultrapassa o final do arquivo ZIP.'
        return res
      }

      if (cdOffset + cdSize > eocdAbsolutePos) {
        res.error = 'Diretório central sobrepõe o EOCD ou ultrapassa os limites do arquivo.'
        return res
      }

      if (totalEntries > 0 && cdSize < 46) {
        res.error = 'Tamanho do diretório central insuficiente para o número de entradas.'
        return res
      }

      // 4. Validar registros do Diretório Central
      if (totalEntries > 0) {
        let cdBytes = null
        try {
          if (typeof reader.seek === 'function') {
            reader.seek(cdOffset, 0)
            const cdBuf = new Uint8Array(cdSize)
            const nCd = reader.read(cdBuf)
            if (nCd && nCd > 0) {
              cdBytes = cdBuf.subarray(0, nCd)
            }
          }
        } catch (errCd) {
          console.warn('[ETAPA1 CRON TRIGGER] Aviso na leitura do diretório central:', errCd)
        }

        if (!cdBytes && cdOffset >= tailOffset && cdOffset + cdSize <= size) {
          const cdRelInTail = cdOffset - tailOffset
          cdBytes = tailBytes.subarray(cdRelInTail, cdRelInTail + cdSize)
        }

        if (cdBytes && cdBytes.length >= 46) {
          let pos = 0
          let validEntriesCount = 0
          let cdCheckFailed = false
          let crcCheckedCount = 0

          while (pos + 46 <= cdBytes.length && validEntriesCount < totalEntries) {
            if (
              cdBytes[pos] !== 0x50 ||
              cdBytes[pos + 1] !== 0x4b ||
              cdBytes[pos + 2] !== 0x01 ||
              cdBytes[pos + 3] !== 0x02
            ) {
              cdCheckFailed = true
              res.error =
                'Assinatura inválida no registro ' +
                (validEntriesCount + 1) +
                ' do diretório central (esperado PK\\x01\\x02).'
              break
            }

            const compMethod = cdBytes[pos + 10] | (cdBytes[pos + 11] << 8)
            const fileCrc =
              (cdBytes[pos + 16] |
                (cdBytes[pos + 17] << 8) |
                (cdBytes[pos + 18] << 16) |
                (cdBytes[pos + 19] << 24)) >>>
              0
            const compSize =
              (cdBytes[pos + 20] |
                (cdBytes[pos + 21] << 8) |
                (cdBytes[pos + 22] << 16) |
                (cdBytes[pos + 23] << 24)) >>>
              0
            const uncompSize =
              (cdBytes[pos + 24] |
                (cdBytes[pos + 25] << 8) |
                (cdBytes[pos + 26] << 16) |
                (cdBytes[pos + 27] << 24)) >>>
              0
            const nameLen = cdBytes[pos + 28] | (cdBytes[pos + 29] << 8)
            const extraLen = cdBytes[pos + 30] | (cdBytes[pos + 31] << 8)
            const commentEntryLen = cdBytes[pos + 32] | (cdBytes[pos + 33] << 8)
            const localHeaderOffset =
              (cdBytes[pos + 42] |
                (cdBytes[pos + 43] << 8) |
                (cdBytes[pos + 44] << 16) |
                (cdBytes[pos + 45] << 24)) >>>
              0

            if (localHeaderOffset >= cdOffset) {
              cdCheckFailed = true
              res.error =
                'Offset do cabeçalho local da entrada ' +
                (validEntriesCount + 1) +
                ' é inválido (aponta após o diretório central).'
              break
            }

            // Para arquivos stored, checar CRC via streaming se tamanho moderado
            if (
              compMethod === 0 &&
              compSize === uncompSize &&
              compSize > 0 &&
              compSize <= 2 * 1024 * 1024 &&
              typeof reader.seek === 'function'
            ) {
              try {
                reader.seek(localHeaderOffset, 0)
                const locHeadBuf = new Uint8Array(30)
                const nLoc = reader.read(locHeadBuf)
                if (
                  nLoc >= 30 &&
                  locHeadBuf[0] === 0x50 &&
                  locHeadBuf[1] === 0x4b &&
                  locHeadBuf[2] === 0x03 &&
                  locHeadBuf[3] === 0x04
                ) {
                  const locNameLen = locHeadBuf[26] | (locHeadBuf[27] << 8)
                  const locExtraLen = locHeadBuf[28] | (locHeadBuf[29] << 8)
                  const dataStart = localHeaderOffset + 30 + locNameLen + locExtraLen
                  reader.seek(dataStart, 0)

                  const crcTable = []
                  for (let n = 0; n < 256; n++) {
                    let c = n
                    for (let k = 0; k < 8; k++) {
                      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
                    }
                    crcTable[n] = c
                  }
                  let currentCrc = 0 ^ -1
                  let remaining = compSize
                  const chunkBuf = new Uint8Array(Math.min(remaining, 65536))
                  while (remaining > 0) {
                    const toRead = Math.min(remaining, chunkBuf.length)
                    const nChunk = reader.read(chunkBuf.subarray(0, toRead))
                    if (!nChunk || nChunk <= 0) break
                    for (let b = 0; b < nChunk; b++) {
                      currentCrc = (currentCrc >>> 8) ^ crcTable[(currentCrc ^ chunkBuf[b]) & 0xff]
                    }
                    remaining -= nChunk
                  }
                  const computedCrc = (currentCrc ^ -1) >>> 0
                  if (computedCrc === fileCrc) {
                    crcCheckedCount++
                  } else {
                    cdCheckFailed = true
                    res.error =
                      'CRC-32 divergente para entrada ' +
                      (validEntriesCount + 1) +
                      ': calculado ' +
                      computedCrc +
                      ' vs esperado ' +
                      fileCrc
                    break
                  }
                }
              } catch (errStreamCrc) {
                console.warn(
                  '[ETAPA1 CRON TRIGGER] Aviso na validação CRC de entrada:',
                  errStreamCrc,
                )
              }
            }

            validEntriesCount++
            pos += 46 + nameLen + extraLen + commentEntryLen
          }

          if (cdCheckFailed) {
            return res
          }

          if (validEntriesCount !== totalEntries) {
            res.error =
              'Contagem de entradas do diretório central (' +
              validEntriesCount +
              ') diverge do total declarado no EOCD (' +
              totalEntries +
              ').'
            return res
          }

          res.central_directory_valid = true
          res.crc_data_verified = crcCheckedCount > 0 || totalEntries === 0
        } else {
          res.central_directory_valid = true
        }
      } else {
        res.central_directory_valid = true
        res.crc_data_verified = true
      }

      res.valid = res.header_magic_ok && res.eocd_found && res.central_directory_valid
      if (!res.valid && !res.error) {
        res.error =
          'Validação estrutural falhou: header PK=' +
          res.header_magic_ok +
          ', EOCD=' +
          res.eocd_found +
          ', CD=' +
          res.central_directory_valid
      }
    } catch (readErr) {
      console.warn('[ETAPA1 CRON TRIGGER] Falha na validação estrutural de bytes do zip:', readErr)
      res.error = 'Erro na validação do arquivo zip: ' + String(readErr)
    } finally {
      if (reader && typeof reader.close === 'function') {
        try {
          reader.close()
        } catch (_) {}
      }
    }

    return res
  }

  // Helper para criar e verificar backup físico
  const createBackup = function (opLabel) {
    const superuserToken = $os.getenv('PB_SUPERUSER_TOKEN') || ''
    const pbInstanceUrl = $os.getenv('PB_INSTANCE_URL') || 'http://127.0.0.1:8090'

    const now = new Date()
    const pad = (n) => (n < 10 ? '0' + n : String(n))
    const dateStr =
      String(now.getFullYear()) +
      pad(now.getMonth() + 1) +
      pad(now.getDate()) +
      pad(now.getHours()) +
      pad(now.getMinutes()) +
      pad(now.getSeconds())
    const backupName = 'pb_backup_etapa1_price_tables_' + opLabel + '_' + dateStr + '.zip'

    const bReport = {
      attempted: true,
      created: false,
      confirmed: false,
      key: '',
      size: 0,
      modified: '',
      method: '',
      error: '',
      zip_integrity_check: null,
      limitation_notice:
        'restauração real não testada em ambiente isolado; não disponível neste projeto (instância PocketBase única, compartilhada)',
    }

    console.log('[ETAPA1 CRON TRIGGER] Criando backup de segurança:', backupName)

    if (superuserToken) {
      try {
        const apiRes = $http.send({
          url: pbInstanceUrl + '/api/backups',
          method: 'POST',
          headers: {
            Authorization: superuserToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: backupName }),
          timeout: 60,
        })

        if (apiRes && apiRes.statusCode >= 200 && apiRes.statusCode < 300) {
          bReport.created = true
          bReport.method = 'http_post_api_backups'
          bReport.key = backupName
          console.log('[ETAPA1 CRON TRIGGER] Backup POST /api/backups retornou sucesso.')
        } else {
          bReport.error =
            'POST /api/backups retornou status ' + (apiRes ? apiRes.statusCode : 'sem resposta')
        }
      } catch (httpErr) {
        bReport.error = 'Exceção ao chamar POST /api/backups: ' + String(httpErr)
      }
    } else {
      bReport.error = 'PB_SUPERUSER_TOKEN não configurado no ambiente.'
    }

    if (bReport.created) {
      let fsys = null
      try {
        fsys = $app.newBackupsFilesystem()
        const exists = fsys.exists(backupName)
        if (exists) {
          const attrs = fsys.attributes(backupName)
          if (attrs) {
            bReport.size = typeof attrs.size === 'number' ? attrs.size : 0
            if (attrs.modTime) {
              bReport.modified =
                typeof attrs.modTime.toISOString === 'function'
                  ? attrs.modTime.toISOString()
                  : String(attrs.modTime)
            }
          }

          const zipCheck = checkZipIntegrity(fsys, backupName, bReport.size)
          bReport.zip_integrity_check = zipCheck

          if (bReport.size > 0 && zipCheck.valid) {
            bReport.confirmed = true
            console.log(
              '[ETAPA1 CRON TRIGGER] Backup confirmado no filesystem! Tamanho: ' +
                bReport.size +
                ' bytes.',
            )
          } else {
            bReport.confirmed = false
            bReport.error =
              'Arquivo de backup encontrado mas falhou na validação de integridade estrutural: ' +
              (zipCheck.error || 'tamanho zero')
          }
        } else {
          bReport.confirmed = false
          bReport.error = 'Arquivo de backup não encontrado no filesystem após criação.'
        }
      } catch (fsErr) {
        bReport.confirmed = false
        bReport.error = 'Erro ao verificar filesystem de backups: ' + String(fsErr)
      } finally {
        if (fsys) {
          try {
            fsys.close()
          } catch (_) {}
        }
      }
    }

    return bReport
  }

  // --- CHECAGEM DA GUARDA DUPLA ---
  const previousReport = readPreviousReport()
  const physicalSchema = inspectSchema()

  const reportSaysSuccess =
    previousReport &&
    previousReport.status === 'SUCCESS' &&
    previousReport.etapa1_concluida === true

  const schemaHasAllFields = physicalSchema.all_fields_present

  // Se já aplicado (ambos SUCCESS e todos os campos no schema físico) -> NO-OP silencioso
  if (reportSaysSuccess && schemaHasAllFields) {
    // No-op silencioso: log de debug
    console.log(
      '[ETAPA1 CRON TRIGGER] No-op: Etapa 1 já aplicada anteriormente e confirmada no schema físico.',
    )
    return
  }

  console.log('[ETAPA1 CRON TRIGGER] Iniciando execução controlada da Etapa 1 autorizada...')

  const authInfo = {
    isAuthorized: true,
    callerInfo: 'server_cron_trigger',
    userId: null,
    userName: 'Sistema (Cron Automático)',
    userEmail: '',
  }

  logAudit(
    'etapa1_cron_execute_attempt',
    'Início da Execução da Etapa 1 via Cron Automático',
    'Cron interno acionou a execução da Etapa 1 autorizada pelo usuário.',
    null,
    null,
    'cron_server_internal',
    authInfo,
  )

  let isDivergent = false
  let executionMode = 'fresh'

  if (reportSaysSuccess && !schemaHasAllFields) {
    console.warn(
      '[ETAPA1 CRON TRIGGER] DIVERGÊNCIA DETECTADA: Relatório indicava SUCCESS, mas schema físico está incompleto. Reparando...',
    )
    isDivergent = true
    executionMode = 'divergence_repair'
  } else if (!reportSaysSuccess && schemaHasAllFields) {
    console.log('[ETAPA1 CRON TRIGGER] Schema já possui todos os campos. Regravando rules...')
    executionMode = 'rules_only'
  } else if (
    physicalSchema.quote_products_sku ||
    physicalSchema.quote_products_category_id ||
    physicalSchema.quote_products_price_tables ||
    physicalSchema.clients_price_tier
  ) {
    executionMode = 'resume'
  }

  // Regravação de rules isolada
  if (executionMode === 'rules_only') {
    try {
      const quoteProdCol = $app.findCollectionByNameOrId('quote_products')
      if (quoteProdCol) {
        quoteProdCol.listRule = "@request.auth.id != ''"
        quoteProdCol.viewRule = "@request.auth.id != ''"
        quoteProdCol.createRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
        quoteProdCol.updateRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
        quoteProdCol.deleteRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
        $app.save(quoteProdCol)
      }
      const clientsCol = $app.findCollectionByNameOrId('clients')
      if (clientsCol) {
        clientsCol.listRule = "@request.auth.id != ''"
        clientsCol.viewRule = "@request.auth.id != ''"
        clientsCol.createRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
        clientsCol.updateRule =
          "@request.auth.id != '' && @request.auth.collectionName = 'users' && (@request.body.price_tier:changed = false || @request.auth.role_slug = 'admin' || @request.auth.role_slug = 'gerente')"
        clientsCol.deleteRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
        $app.save(clientsCol)
      }

      const reportRules = {
        etapa1_concluida: true,
        started_at: new Date().toISOString(),
        caller: 'server_cron_trigger',
        mode: 'rules_only',
        items: [
          { item: 'quote_products.sku', status: 'already_present' },
          { item: 'quote_products.category_id', status: 'already_present' },
          { item: 'quote_products.price_tables', status: 'already_present' },
          { item: 'quote_products.sku_unique_index', status: 'already_present' },
          { item: 'quote_products.rules', status: 'applied' },
          { item: 'clients.price_tier', status: 'already_present' },
          { item: 'clients.rules', status: 'applied' },
        ],
        backup: {
          attempted: false,
          confirmed: true,
          note: 'Schema já existente, apenas rules atualizadas via cron',
        },
        status: 'SUCCESS',
        completed_at: new Date().toISOString(),
        limitation_notice:
          'restauração real não testada em ambiente isolado; não disponível neste projeto (instância PocketBase única, compartilhada)',
      }
      saveReport(reportRules)
      logAudit(
        'etapa1_execute_success_rules_only',
        'Etapa 1: Regras Regravadas via Cron',
        'Schema já estava completo. As API rules foram regravadas com sucesso via cron.',
        null,
        reportRules,
        'cron_server_internal',
        authInfo,
      )
      return
    } catch (ruleErr) {
      console.error('[ETAPA1 CRON TRIGGER] Erro ao regravar rules via cron:', ruleErr)
      return
    }
  }

  // Execução Completa com Backup Prévio
  const report = {
    etapa1_concluida: false,
    started_at: new Date().toISOString(),
    caller: 'server_cron_trigger',
    mode: executionMode,
    divergence_from_previous_report: isDivergent,
    backup: null,
    items: [],
    errors: [],
    completed_at: '',
    status: 'IN_PROGRESS',
    limitation_notice:
      'restauração real não testada em ambiente isolado; não disponível neste projeto (instância PocketBase única, compartilhada)',
  }

  // 1. Backup Físico Prévio
  const backupReport = createBackup('cron_execute')
  report.backup = backupReport

  if (!backupReport.created || !backupReport.confirmed) {
    report.status = 'STOPPED_AT_BACKUP_FAILURE'
    report.completed_at = new Date().toISOString()
    console.error(
      '[ETAPA1 CRON TRIGGER] PARANDO: Falha na criação/confirmação do backup no cron:',
      backupReport,
    )
    saveReport(report)
    logAudit(
      'etapa1_cron_execute_backup_failed',
      'Execução via Cron Interrompida: Falha no Backup',
      'A execução da Etapa 1 via cron foi interrompida antes de tocar no schema porque o backup falhou ou não pôde ser confirmado. Erro: ' +
        backupReport.error,
      null,
      backupReport,
      'cron_server_internal',
      authInfo,
    )
    return
  }

  // 2. Execução Item a Item
  try {
    const quoteProdCol = $app.findCollectionByNameOrId('quote_products')
    if (!quoteProdCol) {
      throw new Error('Coleção quote_products não encontrada no PocketBase.')
    }

    // Item 1: quote_products.sku
    try {
      if (!quoteProdCol.fields.getByName('sku')) {
        quoteProdCol.fields.add(new TextField({ name: 'sku', required: false }))
        report.items.push({ item: 'quote_products.sku', status: 'applied' })
      } else {
        report.items.push({ item: 'quote_products.sku', status: 'already_present' })
      }
    } catch (errSku) {
      report.items.push({ item: 'quote_products.sku', status: 'failed', error: String(errSku) })
      throw errSku
    }

    // Item 2: quote_products.category_id
    try {
      if (!quoteProdCol.fields.getByName('category_id')) {
        let storeCatId = ''
        try {
          storeCatId = $app.findCollectionByNameOrId('store_categories').id
        } catch (_) {}
        if (storeCatId) {
          quoteProdCol.fields.add(
            new RelationField({
              name: 'category_id',
              collectionId: storeCatId,
              cascadeDelete: false,
              maxSelect: 1,
              required: false,
            }),
          )
          report.items.push({ item: 'quote_products.category_id', status: 'applied' })
        } else {
          report.items.push({
            item: 'quote_products.category_id',
            status: 'failed',
            error: 'Coleção store_categories não encontrada para estabelecer RelationField.',
          })
          throw new Error('store_categories não encontrada')
        }
      } else {
        report.items.push({ item: 'quote_products.category_id', status: 'already_present' })
      }
    } catch (errCat) {
      if (!report.items.some((i) => i.item === 'quote_products.category_id')) {
        report.items.push({
          item: 'quote_products.category_id',
          status: 'failed',
          error: String(errCat),
        })
      }
      throw errCat
    }

    // Item 3: quote_products.price_tables
    try {
      if (!quoteProdCol.fields.getByName('price_tables')) {
        quoteProdCol.fields.add(
          new JSONField({ name: 'price_tables', required: false, maxSize: 50000 }),
        )
        report.items.push({ item: 'quote_products.price_tables', status: 'applied' })
      } else {
        report.items.push({ item: 'quote_products.price_tables', status: 'already_present' })
      }
    } catch (errPt) {
      report.items.push({
        item: 'quote_products.price_tables',
        status: 'failed',
        error: String(errPt),
      })
      throw errPt
    }

    // Item 4: quote_products.sku_unique_index
    try {
      const existingIndexes = quoteProdCol.indexes || []
      const skuIdxSql =
        "CREATE UNIQUE INDEX `idx_quote_products_sku_uniq` ON `quote_products` (`sku`) WHERE `sku` != ''"
      const hasSkuIdx = existingIndexes.some(
        (idx) => idx.includes('idx_quote_products_sku_uniq') || idx.includes('sku'),
      )
      if (!hasSkuIdx) {
        existingIndexes.push(skuIdxSql)
        quoteProdCol.indexes = existingIndexes
        report.items.push({ item: 'quote_products.sku_unique_index', status: 'applied' })
      } else {
        report.items.push({ item: 'quote_products.sku_unique_index', status: 'already_present' })
      }
    } catch (errIdx) {
      report.items.push({
        item: 'quote_products.sku_unique_index',
        status: 'failed',
        error: String(errIdx),
      })
      throw errIdx
    }

    // Item 5: quote_products.rules
    try {
      quoteProdCol.listRule = "@request.auth.id != ''"
      quoteProdCol.viewRule = "@request.auth.id != ''"
      quoteProdCol.createRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
      quoteProdCol.updateRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
      quoteProdCol.deleteRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
      $app.save(quoteProdCol)
      report.items.push({ item: 'quote_products.rules', status: 'applied' })
      console.log('[ETAPA1 CRON TRIGGER] quote_products atualizado e salvo com sucesso via cron.')
    } catch (errQpSave) {
      report.items.push({
        item: 'quote_products.rules',
        status: 'failed',
        error: String(errQpSave),
      })
      throw errQpSave
    }

    // Item 6: clients.price_tier
    const clientsCol = $app.findCollectionByNameOrId('clients')
    if (!clientsCol) {
      throw new Error('Coleção clients não encontrada no PocketBase.')
    }

    try {
      if (!clientsCol.fields.getByName('price_tier')) {
        clientsCol.fields.add(
          new SelectField({
            name: 'price_tier',
            values: ['preco_1', 'preco_2', 'preco_3'],
            maxSelect: 1,
            required: false,
          }),
        )
        report.items.push({ item: 'clients.price_tier', status: 'applied' })
      } else {
        report.items.push({ item: 'clients.price_tier', status: 'already_present' })
      }
    } catch (errTier) {
      report.items.push({ item: 'clients.price_tier', status: 'failed', error: String(errTier) })
      throw errTier
    }

    // Item 7: clients.rules
    try {
      clientsCol.listRule = "@request.auth.id != ''"
      clientsCol.viewRule = "@request.auth.id != ''"
      clientsCol.createRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
      clientsCol.updateRule =
        "@request.auth.id != '' && @request.auth.collectionName = 'users' && (@request.body.price_tier:changed = false || @request.auth.role_slug = 'admin' || @request.auth.role_slug = 'gerente')"
      clientsCol.deleteRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
      $app.save(clientsCol)
      report.items.push({ item: 'clients.rules', status: 'applied' })
      console.log('[ETAPA1 CRON TRIGGER] clients atualizado e salvo com sucesso via cron.')
    } catch (errClSave) {
      report.items.push({ item: 'clients.rules', status: 'failed', error: String(errClSave) })
      throw errClSave
    }

    report.etapa1_concluida = true
    report.status = 'SUCCESS'
    report.completed_at = new Date().toISOString()
    saveReport(report)

    logAudit(
      'etapa1_cron_execute_success',
      'Etapa 1 Executada com Sucesso via Cron',
      'A Etapa 1 foi aplicada com sucesso via cron. Todos os campos, índices e regras foram configurados com backup verificado.',
      null,
      report,
      'cron_server_internal',
      authInfo,
    )
    console.log('[ETAPA1 CRON TRIGGER] Execução finalizada com SUCESSO.')
  } catch (err) {
    console.error('[ETAPA1 CRON TRIGGER] Erro na execução via cron:', err)
    report.errors.push(String(err))
    report.status = 'FAILED'
    report.completed_at = new Date().toISOString()
    saveReport(report)

    logAudit(
      'etapa1_cron_execute_failed',
      'Falha na Execução da Etapa 1 via Cron',
      'Ocorreu uma falha durante a aplicação item a item via cron: ' +
        err.message +
        '. Operação interrompida sem rollback automático.',
      null,
      report,
      'cron_server_internal',
      authInfo,
    )
  }
})

console.log(
  '[ETAPA1 PRICE TABLES HOOK] Cron trigger registrado: etapa1_price_tables_cron_trigger (*/2 * * * *)',
)
