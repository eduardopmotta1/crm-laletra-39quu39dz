/**
 * Utilitário de Geração e Normalização de Slugs para a Laletra Store
 *
 * Regras:
 * - Converter para letras minúsculas
 * - Remover acentos (NFD)
 * - Substituir espaços por hífens
 * - Remover caracteres especiais
 * - Evitar hífens duplicados
 * - Remover hífens do início e do fim
 *
 * Exemplos exigidos:
 * - "Adesivos Personalizados" -> adesivos-personalizados
 * - "Cartões de Visita" -> cartoes-de-visita
 * - "Banners & Faixas" -> banners-faixas
 * - "Papelaria Corporativa" -> papelaria-corporativa
 */
export function slugifyCategory(rawText?: string | null): string {
  if (!rawText) return ''

  return (
    rawText
      .toString()
      .trim()
      // Normaliza para NFD para separar acentos
      .normalize('NFD')
      // Remove diacríticos (acentos)
      .replace(/[\u0300-\u036f]/g, '')
      // Converte para minúsculas
      .toLowerCase()
      // Substitui & por hífen ou remove
      .replace(/&+/g, '-')
      // Substitui caracteres não alfanuméricos por hífen
      .replace(/[^a-z0-9]+/g, '-')
      // Remove múltiplos hífens consecutivos
      .replace(/-+/g, '-')
      // Remove hífens do início e do fim
      .replace(/^-+|-+$/g, '')
  )
}
