// WhatsApp Webhook — validação GET e recebimento POST da Meta Cloud API
// ETAPA 3C: Processamento de statuses[] e recebimento de mensagens Meta Cloud API
// Endpoint público: /backend/v1/crm/whatsapp-webhook

routerAdd('GET', '/backend/v1/crm/whatsapp-webhook', (e) => {
  const hubMode = e.request.url.query().get('hub.mode')
  const hubToken = e.request.url.query().get('hub.verify_token')
  const hubChallenge = e.request.url.query().get('hub.challenge')

  const verifyToken = 'laletra_crm_webhook_2024'

  console.log(
    '[WHATSAPP WEBHOOK GET]',
    'mode:',
    hubMode,
    'token:',
    hubToken ? hubToken.substring(0, 4) + '...' : 'undefined',
  )

  if (hubMode === 'subscribe' && hubToken === verifyToken) {
    return e.string(200, String(hubChallenge))
  }
  return e.string(403, 'Forbidden')
})

routerAdd('POST', '/backend/v1/crm/whatsapp-webhook', (e) => {
  // 1. Resposta rápida 200 para a Meta; encapsulado em try/catch para nunca reenviar em loop
  try {
    const rawBody = e.requestInfo().body || {}

    // Helpers internos (escopo interno obrigatório para runtime Goja no PocketBase)
    const normalizeDigits = function (input) {
      if (!input) return ''
      let d = String(input).replace(/\D/g, '')
      if (!d) return ''
      if ((d.length === 10 || d.length === 11) && !d.startsWith('55')) {
        d = '55' + d
      }
      return d
    }

    const extractPhoneWithoutDDI = function (normWithDDI) {
      if (!normWithDDI) return ''
      if (normWithDDI.startsWith('55') && normWithDDI.length >= 12) {
        return normWithDDI.substring(2)
      }
      return normWithDDI
    }

    // 2. Validar se o payload tem a estrutura da Meta Cloud API: entry[] -> changes[] -> value
    const entryList = rawBody.entry || []
    if (!Array.isArray(entryList) || entryList.length === 0) {
      console.log('[WHATSAPP WEBHOOK POST] Payload sem entry array. Ignorado.')
      return e.json(200, { status: 'ignored', reason: 'no_entry' })
    }

    let processedCount = 0
    let duplicateCount = 0
    let ignoredCount = 0
    let statusProcessedCount = 0
    let statusIgnoredCount = 0

    const messagesCol = $app.findCollectionByNameOrId('messages')

    // Mapeamento oficial de status Meta -> PocketBase messages.status
    const VALID_STATUSES = {
      sent: 'sent',
      delivered: 'delivered',
      read: 'read',
      failed: 'failed',
    }

    for (let i = 0; i < entryList.length; i++) {
      const entry = entryList[i]
      const changes = entry.changes || []

      for (let j = 0; j < changes.length; j++) {
        const change = changes[j]
        const value = change.value || {}

        // 3. Processamento de statuses[] (ETAPA 3C)
        const statuses = value.statuses || []
        if (Array.isArray(statuses) && statuses.length > 0) {
          for (let s = 0; s < statuses.length; s++) {
            const statusObj = statuses[s]
            const wamid = String(statusObj.id || '').trim()
            const rawStatus = String(statusObj.status || '')
              .toLowerCase()
              .trim()
            const statusTimestamp = statusObj.timestamp ? String(statusObj.timestamp) : ''
            const recipientId = String(statusObj.recipient_id || '').trim()
            const errorsList = statusObj.errors || []

            if (!wamid) {
              console.log('[WHATSAPP WEBHOOK POST] Status sem WAMID (id). Ignorado.')
              statusIgnoredCount++
              continue
            }

            const mappedStatus = VALID_STATUSES[rawStatus]
            if (!mappedStatus) {
              console.log(
                '[WHATSAPP WEBHOOK POST] Status desconhecido recebido para WAMID ' +
                  wamid +
                  ': "' +
                  rawStatus +
                  '". Ignorado.',
              )
              statusIgnoredCount++
              continue
            }

            // Localizar mensagem correspondente pelo campo whatsapp_message_id
            let targetMsg = null
            try {
              const foundList = $app.findRecordsByFilter(
                'messages',
                "whatsapp_message_id = '" + wamid + "'",
                '-created',
                1,
                0,
              )
              if (foundList && foundList.length > 0) {
                targetMsg = foundList[0]
              }
            } catch (errFilterMsg) {
              console.warn(
                '[WHATSAPP WEBHOOK POST] Aviso ao buscar mensagem pelo WAMID ' + wamid + ':',
                errFilterMsg,
              )
            }

            // Se não encontrar mensagem pelo WAMID: NÃO criar registro novo; apenas logar
            if (!targetMsg) {
              console.log(
                '[WHATSAPP WEBHOOK POST] [STATUS SEM MENSAGEM] WAMID não localizado no banco: ' +
                  wamid +
                  ' | status: ' +
                  mappedStatus +
                  ' | recipient: ' +
                  recipientId,
              )
              statusIgnoredCount++
              continue
            }

            // Se status = failed, extrair detalhes com segurança (sem tokens/secrets)
            let errorDetails = null
            if (mappedStatus === 'failed') {
              let firstErr = {}
              if (Array.isArray(errorsList) && errorsList.length > 0) {
                firstErr = errorsList[0] || {}
              }
              const errCode = firstErr.code || statusObj.code || ''
              const errTitle = firstErr.title || firstErr.message || statusObj.title || ''
              const errMsg =
                firstErr.error_data && firstErr.error_data.details
                  ? firstErr.error_data.details
                  : firstErr.message || ''
              const errSubcode = firstErr.error_subcode || ''

              errorDetails = {
                code: errCode,
                title: errTitle,
                message: errMsg,
                error_subcode: errSubcode,
              }

              console.error(
                '[WHATSAPP WEBHOOK POST] [STATUS FAILED] WAMID: ' +
                  wamid +
                  ' | RecordId: ' +
                  targetMsg.id +
                  ' | Code: ' +
                  errCode +
                  ' | Subcode: ' +
                  errSubcode +
                  ' | Title: ' +
                  errTitle +
                  ' | Message: ' +
                  errMsg,
              )
            }

            // Idempotência: se a mensagem já possui exatamente esse status, não faz nada
            const currentStatus = String(targetMsg.get('status') || '')
            if (currentStatus === mappedStatus) {
              console.log(
                '[WHATSAPP WEBHOOK POST] Status já registrado para WAMID ' +
                  wamid +
                  ' (' +
                  mappedStatus +
                  '). Ignorando reenvio (idempotente).',
              )
              statusProcessedCount++
              continue
            }

            // Atualizar status da mensagem correspondente
            try {
              targetMsg.set('status', mappedStatus)
              $app.save(targetMsg)
              statusProcessedCount++

              console.log('[WHATSAPP WEBHOOK POST] Status da mensagem atualizado com sucesso:', {
                recordId: targetMsg.id,
                wamid: wamid,
                oldStatus: currentStatus,
                newStatus: mappedStatus,
                recipientId: recipientId,
                timestamp: statusTimestamp,
                errorDetails: errorDetails,
              })
            } catch (saveErr) {
              console.error(
                '[WHATSAPP WEBHOOK POST] Erro ao salvar status para mensagem ' +
                  targetMsg.id +
                  ' (WAMID ' +
                  wamid +
                  '):',
                saveErr,
              )
            }
          }
        }

        // 4. Processamento de mensagens inbound (messages[])
        const messages = value.messages || []
        if (!Array.isArray(messages) || messages.length === 0) {
          ignoredCount++
          continue
        }

        const phoneNumberId =
          value.metadata && value.metadata.phone_number_id
            ? String(value.metadata.phone_number_id)
            : ''

        const contacts = value.contacts || []

        for (let m = 0; m < messages.length; m++) {
          const msg = messages[m]
          const metaMsgId = String(msg.id || '').trim()
          const msgType = String(msg.type || '').trim()
          const msgTimestamp = msg.timestamp ? String(msg.timestamp) : ''
          const fromWaId = String(msg.from || '').trim()

          // Nome do remetente pelo contato do payload se existir
          let profileName = ''
          if (contacts.length > 0 && contacts[0].profile && contacts[0].profile.name) {
            profileName = String(contacts[0].profile.name).trim()
          }

          // Apenas mensagens de texto neste estágio
          if (msgType !== 'text' || !msg.text || !msg.text.body) {
            console.log(
              '[WHATSAPP WEBHOOK POST] Mensagem tipo "' +
                msgType +
                '" ignorada. Apenas texto é suportado nesta etapa. MetaId: ' +
                metaMsgId,
            )
            ignoredCount++
            continue
          }

          const msgBodyText = String(msg.text.body).trim()
          if (!msgBodyText) {
            ignoredCount++
            continue
          }

          // 4. Normalização do telefone no padrão do CRM (com DDI 55, ex: 5521970156756)
          const normalizedPhoneWithDDI = normalizeDigits(fromWaId)
          const normalizedPhoneWithoutDDI = extractPhoneWithoutDDI(normalizedPhoneWithDDI)

          // 5. Idempotência estrita: verificar se já existe mensagem com esse whatsapp_message_id
          if (metaMsgId) {
            let existingMsg = null
            try {
              const existingList = $app.findRecordsByFilter(
                'messages',
                "whatsapp_message_id = '" + metaMsgId + "'",
                '-created',
                1,
                0,
              )
              if (existingList && existingList.length > 0) {
                existingMsg = existingList[0]
              }
            } catch (errFilter) {
              console.warn(
                '[WHATSAPP WEBHOOK POST] Aviso ao buscar duplicidade por whatsapp_message_id:',
                errFilter,
              )
            }

            if (existingMsg) {
              console.log(
                '[WHATSAPP WEBHOOK POST] Mensagem duplicada ignorada (idempotência). MetaId: ' +
                  metaMsgId +
                  ', RecordId: ' +
                  existingMsg.id,
              )
              duplicateCount++
              continue
            }
          }

          // 6. Procurar cliente existente pelo telefone normalizado
          // Testa normalizedPhoneWithDDI (ex: 5521970156756), normalizedPhoneWithoutDDI (ex: 21970156756) ou phone direto
          let foundClient = null

          if (normalizedPhoneWithDDI) {
            try {
              // Busca 1: normalized_phone igual ao número com 55
              const list1 = $app.findRecordsByFilter(
                'clients',
                "normalized_phone = '" + normalizedPhoneWithDDI + "'",
                '-created',
                1,
                0,
              )
              if (list1 && list1.length > 0) {
                foundClient = list1[0]
              }
            } catch (_) {}

            if (!foundClient && normalizedPhoneWithoutDDI) {
              try {
                // Busca 2: normalized_phone igual ao número sem 55
                const list2 = $app.findRecordsByFilter(
                  'clients',
                  "normalized_phone = '" + normalizedPhoneWithoutDDI + "'",
                  '-created',
                  1,
                  0,
                )
                if (list2 && list2.length > 0) {
                  foundClient = list2[0]
                }
              } catch (_) {}
            }

            if (!foundClient) {
              try {
                // Busca 3: telefone exato ou contendo os dígitos
                const list3 = $app.findRecordsByFilter(
                  'clients',
                  "phone ~ '" +
                    normalizedPhoneWithoutDDI +
                    "' || phone ~ '" +
                    normalizedPhoneWithDDI +
                    "'",
                  '-created',
                  1,
                  0,
                )
                if (list3 && list3.length > 0) {
                  foundClient = list3[0]
                }
              } catch (_) {}
            }
          }

          let clientId = ''
          let attendanceId = ''
          const todayDateStr = new Date().toISOString().split('T')[0]

          if (foundClient) {
            clientId = foundClient.id

            // Lógica de Atendimento Aberto Comercial (Regras 1 a 6)
            // 1. Procurar atendimento comercial ABERTO: is_archived != true && stage != 'Venda fechada' && stage != 'Não fechou'
            try {
              const openAttFilter =
                "client_id = '" +
                clientId +
                "' && is_archived != true && stage != 'Venda fechada' && stage != 'Não fechou'"

              const openAttendances = $app.findRecordsByFilter(
                'attendances',
                openAttFilter,
                '-created',
                1,
                0,
              )

              if (openAttendances && openAttendances.length > 0) {
                // 2. SE EXISTIR atendimento aberto:
                // - NÃO criar outro attendance.
                // - Vincular a mensagem ao attendance existente.
                // - Atualizar last_customer_message_at.
                // - Mover stage para "Precisa responder" (EXCEÇÃO: se já estiver em "Novo contato", permanecer).
                const targetAtt = openAttendances[0]
                attendanceId = targetAtt.id
                const currentStage = String(targetAtt.get('stage') || '')

                targetAtt.set('last_customer_message_at', todayDateStr)

                if (currentStage !== 'Novo contato' && currentStage !== 'Precisa responder') {
                  targetAtt.set('stage', 'Precisa responder')
                }

                $app.save(targetAtt)
                console.log(
                  '[WHATSAPP WEBHOOK POST] Atendimento aberto existente reutilizado:',
                  attendanceId,
                  '| stage anterior:',
                  currentStage,
                  '| stage atual:',
                  targetAtt.get('stage'),
                )
              } else {
                // 3. SE NÃO EXISTIR atendimento aberto:
                // - Criar exatamente 1 novo attendance para o cliente.
                // - stage = "Novo contato", is_archived = false.
                // - Vincular a mensagem recebida ao novo attendance.
                // - Preencher last_customer_message_at.
                // - assigned_to: herdar do cliente se existir; não inventar responsável.
                const attendancesCol = $app.findCollectionByNameOrId('attendances')
                const newAtt = new Record(attendancesCol)
                newAtt.set('client_id', clientId)
                newAtt.set('stage', 'Novo contato')
                newAtt.set('is_archived', false)
                newAtt.set('last_customer_message_at', todayDateStr)
                newAtt.set('source', 'whatsapp')

                const clientAssignedTo = foundClient.get('assigned_to')
                if (clientAssignedTo) {
                  newAtt.set('assigned_to', clientAssignedTo)
                }

                $app.save(newAtt)
                attendanceId = newAtt.id

                console.log(
                  '[WHATSAPP WEBHOOK POST] Novo atendimento criado com sucesso:',
                  attendanceId,
                  'para o cliente:',
                  clientId,
                  '| assigned_to:',
                  clientAssignedTo || 'nenhum',
                )
              }
            } catch (attProcErr) {
              console.error(
                '[WHATSAPP WEBHOOK POST] Erro ao resolver/criar atendimento para o cliente ' +
                  clientId +
                  ':',
                attProcErr,
              )
            }
          } else {
            // Requisito 7: Se NÃO existir cliente, NÃO criar automaticamente.
            console.log(
              '[WHATSAPP WEBHOOK POST] Cliente não cadastrado para o remetente: ' +
                normalizedPhoneWithDDI +
                '. A mensagem não será vinculada a client_id.',
            )
          }

          // 7. Gravar na collection 'messages'
          const newMsgRecord = new Record(messagesCol)
          if (clientId) {
            newMsgRecord.set('client_id', clientId)
          }
          if (attendanceId) {
            newMsgRecord.set('attendance_id', attendanceId)
          }
          newMsgRecord.set('direction', 'inbound')
          newMsgRecord.set('message_text', msgBodyText)
          newMsgRecord.set(
            'sender_name',
            profileName || (foundClient ? foundClient.get('name') : 'Cliente WhatsApp'),
          )
          newMsgRecord.set('status', 'delivered')
          if (metaMsgId) {
            newMsgRecord.set('whatsapp_message_id', metaMsgId)
          }

          $app.save(newMsgRecord)
          processedCount++

          // 8. Se cliente existir, atualizar last_message_*
          if (foundClient) {
            try {
              foundClient.set('last_message_at', todayDateStr)
              foundClient.set('last_message_direction', 'inbound')
              foundClient.set('last_message_text', msgBodyText.substring(0, 100))
              $app.save(foundClient)
            } catch (cErr) {
              console.warn('[WHATSAPP WEBHOOK POST] Aviso ao atualizar client last_message:', cErr)
            }
          }

          // Log seguro (sem secrets ou access tokens)
          console.log('[WHATSAPP WEBHOOK POST] Mensagem processada com sucesso:', {
            recordId: newMsgRecord.id,
            metaMsgId: metaMsgId,
            phone: normalizedPhoneWithDDI,
            hasClient: Boolean(clientId),
            clientId: clientId || null,
            textPreview:
              msgBodyText.length > 40 ? msgBodyText.substring(0, 40) + '...' : msgBodyText,
            timestamp: msgTimestamp,
            phoneNumberId: phoneNumberId,
          })
        }
      }
    }

    return e.json(200, {
      status: 'success',
      processed: processedCount,
      duplicates: duplicateCount,
      ignored: ignoredCount,
      statuses_processed: statusProcessedCount,
      statuses_ignored: statusIgnoredCount,
    })
  } catch (err) {
    // Nunca retornar 500 para evitar que a Meta entre em loop de reenvio
    console.error('[WHATSAPP WEBHOOK POST] Erro durante processamento:', err)
    return e.json(200, {
      status: 'error_handled',
      error: 'internal_error_swallowed_for_meta',
    })
  }
})
