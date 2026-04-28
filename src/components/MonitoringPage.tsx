import { RotateCcw, Search, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { TraceLog } from '../types/a2a'

type Props = {
  logs: TraceLog[]
  onClearTraces: () => void
  onReplayTrace: (trace: TraceLog) => void
}

function formatDuration(durationMs: number) {
  if (durationMs < 1000) return `${durationMs} ms`
  return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 2 : 1)} s`
}

function JsonBlock({ value, raw }: { value: unknown; raw?: boolean }) {
  return <pre>{typeof value === 'string' ? value : JSON.stringify(value, null, raw ? 0 : 2)}</pre>
}

export function MonitoringPage({ logs, onClearTraces, onReplayTrace }: Props) {
  const [query, setQuery] = useState('')
  const [previousSearches, setPreviousSearches] = useState<string[]>([])
  const [selectedTrace, setSelectedTrace] = useState<TraceLog | null>(null)
  const [rawTracePayload, setRawTracePayload] = useState(false)
  const longestTrace = Math.max(1, ...logs.map((log) => log.durationMs))
  const visibleLogs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return logs

    return logs.filter((log) =>
      [log.contextId, log.requestId, log.displayText, log.label, log.kind]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery)),
    )
  }, [logs, query])

  const commitSearch = (value: string) => {
    const nextSearch = value.trim()
    if (!nextSearch) return
    setPreviousSearches((current) => [nextSearch, ...current.filter((item) => item !== nextSearch)].slice(0, 8))
  }

  return (
    <section className="monitoring-page panel-section">
      <div className="section-heading monitoring-heading">
        <div>
          <span className="eyebrow">Monitoring</span>
          <h2>Trace monitoring</h2>
        </div>
        <button className="icon-button" type="button" onClick={onClearTraces} aria-label="Clear traces">
          <Trash2 size={15} />
        </button>
      </div>

      <div className="monitoring-toolbar">
        <div className="input-with-icon">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onBlur={(event) => commitSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitSearch(event.currentTarget.value)
            }}
            placeholder="Search by context id, request id, or text"
            aria-label="Search traces"
          />
        </div>
        <div className="previous-searches">
          <div className="previous-searches-heading">
            <span>Previous searches</span>
            {previousSearches.length > 0 ? (
              <button type="button" onClick={() => setPreviousSearches([])}>
                Clear
              </button>
            ) : null}
          </div>
          {previousSearches.length === 0 ? (
            <p>No previous searches</p>
          ) : (
            <div className="previous-search-list">
              {previousSearches.map((search) => (
                <span className="previous-search" key={search}>
                  <input
                    value={search}
                    onChange={(event) => {
                      const value = event.target.value
                      setPreviousSearches((current) => current.map((item) => (item === search ? value : item)))
                    }}
                    onFocus={() => setQuery(search)}
                    aria-label={`Previous search ${search}`}
                  />
                  <button
                    type="button"
                    onClick={() => setPreviousSearches((current) => current.filter((item) => item !== search))}
                    aria-label={`Clear previous search ${search}`}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {visibleLogs.length === 0 ? (
        <div className="inspector-empty monitoring-empty">No Information</div>
      ) : (
        <div className="monitoring-timeline timeline">
          {visibleLogs.map((log) => (
            <button className="timeline-item" type="button" key={log.id} onClick={() => setSelectedTrace(log)}>
              <span className={`timeline-dot ${log.status}`} />
              <span className="timeline-copy">
                <strong>{log.displayText || log.label}</strong>
                <span>
                  {log.kind} • {new Date(log.timestamp).toLocaleTimeString()}
                </span>
              </span>
              <span className="timeline-bar">
                <span style={{ width: `${Math.max(8, (log.durationMs / longestTrace) * 100)}%` }} />
              </span>
              <span className="timeline-ms">{formatDuration(log.durationMs)}</span>
            </button>
          ))}
        </div>
      )}

      {selectedTrace ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedTrace(null)}>
          <div className="modal trace-modal" role="dialog" aria-modal="true" aria-label="Trace details" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading trace-modal-heading">
              <div>
                <h2>{selectedTrace.label}</h2>
                <p>{formatDuration(selectedTrace.durationMs)}</p>
                {selectedTrace.contextId ? <p>Context: {selectedTrace.contextId}</p> : null}
              </div>
              <button className="icon-button subtle" type="button" onClick={() => setSelectedTrace(null)} aria-label="Close trace modal">
                <X size={15} />
              </button>
            </div>
            <div className="trace-modal-actions">
              <button className={rawTracePayload ? '' : 'active'} type="button" onClick={() => setRawTracePayload(false)}>
                Pretty
              </button>
              <button className={rawTracePayload ? 'active' : ''} type="button" onClick={() => setRawTracePayload(true)}>
                Raw
              </button>
              {selectedTrace.kind === 'request' ? (
                <button type="button" onClick={() => onReplayTrace(selectedTrace)}>
                  <RotateCcw size={13} />
                  Replay Event
                </button>
              ) : null}
            </div>
            <div className="trace-detail-grid">
              <section>
                <h3 className="trace-request-label">Request</h3>
                <JsonBlock value={selectedTrace.request} raw={rawTracePayload} />
              </section>
              <section>
                <h3 className="trace-response-label">Response</h3>
                <JsonBlock value={selectedTrace.response} raw={rawTracePayload} />
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
