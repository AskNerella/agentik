import { useCallback, useState } from 'react'
import type { TraceLog } from '../types/a2a'

export function useTrace(initialLogs: TraceLog[] = []) {
  const [logs, setLogs] = useState<TraceLog[]>(initialLogs)

  const appendTrace = useCallback((trace: Omit<TraceLog, 'id' | 'timestamp'>) => {
    setLogs((current) => [
      {
        ...trace,
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
      ...current,
    ])
  }, [])

  const clearLogs = useCallback(() => setLogs([]), [])

  return { logs, appendTrace, clearLogs, setLogs }
}
