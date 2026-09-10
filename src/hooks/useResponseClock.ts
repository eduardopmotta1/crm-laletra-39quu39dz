import { useState, useEffect } from 'react'

/**
 * Hook para atualização do relógio de resposta em tempo real.
 * Dispara um tick a cada tickIntervalMs (padrão 30 segundos)
 * e reinicia imediatamente caso referenceTime mude (ex: nova mensagem inbound realtime).
 *
 * Não faz requisições ao backend a cada tick — apenas força re-render local para recalcular o label.
 * Limpa o timer automaticamente no unmount (clearInterval).
 */
export function useResponseClock(
  referenceTime?: string | null,
  tickIntervalMs: number = 30000,
): number {
  const [tick, setTick] = useState<number>(0)

  // Quando referenceTime mudar (ex: nova mensagem inbound em tempo real),
  // reinicia imediatamente o contador local (tick) para que o label volte para "agora"
  useEffect(() => {
    setTick((t) => t + 1)
  }, [referenceTime])

  useEffect(() => {
    if (tickIntervalMs <= 0) return

    const intervalId = setInterval(() => {
      setTick((t) => t + 1)
    }, tickIntervalMs)

    return () => {
      clearInterval(intervalId)
    }
  }, [tickIntervalMs])

  return tick
}
