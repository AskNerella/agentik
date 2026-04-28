import { useCallback, useMemo, useState } from 'react'
import { fetchAgentCard } from '../services/a2aClient'
import type { AgentCard, TraceLog } from '../types/a2a'
import { validateAgentCard } from '../utils/agentCardValidation'

type AppendTrace = (trace: Omit<TraceLog, 'id' | 'timestamp'>) => void

export function useAgent(appendTrace: AppendTrace) {
  const [card, setCard] = useState<AgentCard | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const validation = useMemo(() => validateAgentCard(card), [card])

  const loadAgentCard = useCallback(
    async (endpoint: string, headers: Record<string, string>) => {
      setLoading(true)
      setError(null)
      const startedAt = performance.now()

      try {
        const nextCard = await fetchAgentCard(endpoint, headers)
        setCard(nextCard)
        appendTrace({
          label: 'Fetch agent card',
          kind: 'agent-card',
          request: { method: 'GET', endpoint, headers },
          response: nextCard,
          status: 'ok',
          durationMs: Math.round(performance.now() - startedAt),
        })
        return nextCard
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'Unable to fetch agent card'
        setCard(null)
        setError(message)
        appendTrace({
          label: 'Fetch agent card',
          kind: 'agent-card',
          request: { method: 'GET', endpoint, headers },
          response: { error: message },
          status: 'error',
          durationMs: Math.round(performance.now() - startedAt),
        })
        return null
      } finally {
        setLoading(false)
      }
    },
    [appendTrace],
  )

  const clearAgentCard = useCallback(() => {
    setCard(null)
    setError(null)
  }, [])

  return { card, setCard, clearAgentCard, validation, loading, error, loadAgentCard }
}
