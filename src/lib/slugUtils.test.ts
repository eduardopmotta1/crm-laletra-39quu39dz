import { describe, it, expect } from 'vitest'
import { slugifyCategory } from './slugUtils'

describe('slugifyCategory — Utilitário de Geração de Slug da Laletra Store', () => {
  it('converte exemplos oficiais exigidos pelo usuário', () => {
    expect(slugifyCategory('Adesivos Personalizados')).toBe('adesivos-personalizados')
    expect(slugifyCategory('Cartões de Visita')).toBe('cartoes-de-visita')
    expect(slugifyCategory('Banners & Faixas')).toBe('banners-faixas')
    expect(slugifyCategory('Papelaria Corporativa')).toBe('papelaria-corporativa')
  })

  it('remove acentos e diacríticos complexos', () => {
    expect(slugifyCategory('Crachás & Cordões')).toBe('crachas-cordoes')
    expect(slugifyCategory('Ímãs de Geladeira')).toBe('imas-de-geladeira')
    expect(slugifyCategory('Rótulos em Adesivo Vinílico')).toBe('rotulos-em-adesivo-vinilico')
    expect(slugifyCategory('Comunicação Visual')).toBe('comunicacao-visual')
  })

  it('remove caracteres especiais e pontuação', () => {
    expect(slugifyCategory('Produtos #1 / Gráfica!')).toBe('produtos-1-grafica')
    expect(slugifyCategory('Banner (Lona 440g) + Ilhós')).toBe('banner-lona-440g-ilhos')
    expect(slugifyCategory('Adesivos @ Laletra & Cia * 100%')).toBe('adesivos-laletra-cia-100')
  })

  it('evita hífens duplicados e remove hífens de início e fim', () => {
    expect(slugifyCategory('---Adesivos---')).toBe('adesivos')
    expect(slugifyCategory('   Cartões    de     Visita   ')).toBe('cartoes-de-visita')
    expect(slugifyCategory('& & &')).toBe('')
  })

  it('trata valores vazios, nulos ou indefinidos de forma segura', () => {
    expect(slugifyCategory('')).toBe('')
    expect(slugifyCategory(null)).toBe('')
    expect(slugifyCategory(undefined)).toBe('')
    expect(slugifyCategory('    ')).toBe('')
  })
})
