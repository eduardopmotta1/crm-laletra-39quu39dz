import { describe, it, expect } from 'vitest'
import {
  combineDateAndTimeForStorage,
  parseTaskDueDate,
  formatFollowUpDateTime,
} from './taskDateUtils'

describe('taskDateUtils', () => {
  describe('combineDateAndTimeForStorage', () => {
    it('deve combinar data e hora em datetime completo', () => {
      const combined = combineDateAndTimeForStorage('2026-09-14', '10:30')
      expect(combined).toBeTruthy()
      expect(combined).toContain('2026-09-14')
      // Pode ser ISO string ou UTC string contendo 30 minutos
      const dateObj = new Date(combined)
      expect(dateObj.getMinutes()).toBe(30)
      expect(dateObj.getHours()).toBe(10)
    })

    it('deve lidar com falta de hora mantendo 00:00:00 legado', () => {
      const combined = combineDateAndTimeForStorage('2026-09-14', '')
      expect(combined).toBe('2026-09-14 00:00:00.000Z')
    })
  })

  describe('parseTaskDueDate', () => {
    it('deve reconhecer registros legados com 00:00:00 como sem horário (hasTime: false)', () => {
      const parsedLegacy1 = parseTaskDueDate('2026-09-14 00:00:00.000Z')
      expect(parsedLegacy1.date).toBe('2026-09-14')
      expect(parsedLegacy1.hasTime).toBe(false)
      expect(parsedLegacy1.time).toBe('')

      const parsedLegacy2 = parseTaskDueDate('2026-09-14')
      expect(parsedLegacy2.date).toBe('2026-09-14')
      expect(parsedLegacy2.hasTime).toBe(false)
    })

    it('deve extrair data e hora de registro com horário específico', () => {
      // Exemplo: '2026-09-14' com 10:30 gerado pelo combineDateAndTimeForStorage
      const stored = combineDateAndTimeForStorage('2026-09-14', '10:30')
      const parsed = parseTaskDueDate(stored)
      expect(parsed.date).toBe('2026-09-14')
      expect(parsed.hasTime).toBe(true)
      expect(parsed.time).toBe('10:30')
    })
  })

  describe('formatFollowUpDateTime', () => {
    it('deve formatar registro legado sem hora apenas com DD/MM/YYYY', () => {
      const formatted = formatFollowUpDateTime('2026-09-14 00:00:00.000Z')
      expect(formatted).toBe('14/09/2026')
    })

    it('deve formatar novo registro com data e hora como "DD/MM/YYYY às HH:mm"', () => {
      const stored = combineDateAndTimeForStorage('2026-09-14', '10:30')
      const formatted = formatFollowUpDateTime(stored)
      expect(formatted).toBe('14/09/2026 às 10:30')
    })
  })

  describe('Cenário de teste obrigatório da tarefa', () => {
    it('criar Follow-up com data de amanhã e hora 10:30, reabrir e confirmar que data e hora (10:30) são exibidas corretamente', () => {
      // Data de amanhã
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const year = tomorrow.getFullYear()
      const month = String(tomorrow.getMonth() + 1).padStart(2, '0')
      const day = String(tomorrow.getDate()).padStart(2, '0')
      const tomorrowStr = `${year}-${month}-${day}`
      const timeStr = '10:30'

      // 1. Salvar combinando Data + Hora
      const due_date = combineDateAndTimeForStorage(tomorrowStr, timeStr)
      expect(due_date).toBeTruthy()
      expect(due_date).not.toBe(tomorrowStr) // NÃO foi truncado!

      // 2. Reabrir e carregar na edição
      const loadedForEdit = parseTaskDueDate(due_date)
      expect(loadedForEdit.date).toBe(tomorrowStr)
      expect(loadedForEdit.time).toBe('10:30')
      expect(loadedForEdit.hasTime).toBe(true)

      // 3. Exibição formatada
      const displayString = formatFollowUpDateTime(due_date)
      expect(displayString).toBe(`${day}/${month}/${year} às 10:30`)
    })
  })
})
