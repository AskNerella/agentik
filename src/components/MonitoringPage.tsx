import { ArrowLeft, RotateCcw, Search, Trash2, X } from 'lucide-react'
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

function getTraceStart(log: TraceLog) {
  return new Date(log.requestTimestamp || log.timestamp).getTime()
}

export function MonitoringPage({ logs, onClearTraces, onReplayTrace }: Props) {
  const [query, setQuery] = useState('')
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [selectedTrace, setSelectedTrace] = useState<TraceLog | null>(null)
  const [rawTracePayload, setRawTracePayload] = useState(false)
  const visibleLogs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return logs

    return logs.filter((log) =>
      [log.contextId, log.requestId, log.displayText, log.label, log.kind]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery)),
    )
  }, [logs, query])
  const conversations = useMemo(() => {
    const grouped = visibleLogs.reduce<Record<string, TraceLog[]>>((acc, log) => {
      const key = log.contextId || 'agent-card'
      acc[key] = [...(acc[key] ?? []), log]
      return acc
    }, {})

    return Object.entries(grouped)
      .map(([contextId, groupLogs]) => ({
        contextId,
        logs: [...groupLogs].sort((a, b) => getTraceStart(a) - getTraceStart(b)),
      }))
      .sort((a, b) => getTraceStart(b.logs[0]) - getTraceStart(a.logs[0]))
  }, [visibleLogs])
  const selectedConversation =
    conversations.find((conversation) => conversation.contextId === selectedConversationId) ?? null
  const chartLogs = selectedConversation?.logs ?? []
  const chartStart = Math.min(...chartLogs.map(getTraceStart), Date.now())
  const chartEnd = Math.max(...chartLogs.map((log) => getTraceStart(log) + Math.max(log.durationMs, 1)), chartStart + 1)
  const chartSpan = Math.max(1, chartEnd - chartStart)

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
        {selectedConversation ? (
          <button className="icon-button subtle monitoring-back-button" type="button" onClick={() => setSelectedConversationId(null)} aria-label="Back to conversations">
            <ArrowLeft size={15} />
          </button>
        ) : null}
        <div className="input-with-icon">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by context id, request id, or text"
            aria-label="Search traces"
          />
        </div>
      </div>

      {visibleLogs.length === 0 ? (
        <div className="inspector-empty monitoring-empty">No Information</div>
      ) : !selectedConversation ? (
        <div className="conversation-trace-list monitoring-jump-view" key="conversation-list">
          {conversations.map((conversation) => {
            const startedAt = getTraceStart(conversation.logs[0])
            const finishedAt = Math.max(...conversation.logs.map((log) => getTraceStart(log) + Math.max(log.durationMs, 1)))
            const requestCount = conversation.logs.filter((log) => log.kind === 'request').length
            const streamCount = conversation.logs.filter((log) => log.kind === 'stream').length
            const errorCount = conversation.logs.filter((log) => log.status === 'error').length

            return (
              <button
                className="conversation-trace-row"
                type="button"
                key={conversation.contextId}
                onClick={() => setSelectedConversationId(conversation.contextId)}
              >
                <span className={`timeline-dot ${errorCount ? 'error' : 'ok'}`} />
                <span className="conversation-trace-main">
                  <strong>{conversation.contextId === 'agent-card' ? 'Agent card requests' : conversation.contextId}</strong>
                  <span>
                    {requestCount} requests • {streamCount} stream events • {formatDuration(finishedAt - startedAt)}
                  </span>
                </span>
                <span>{new Date(startedAt).toLocaleTimeString()}</span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="monitoring-scroll monitoring-jump-view" key={selectedConversation.contextId}>
          <div className="gantt-detail-heading">
            <div>
              <span className="eyebrow">Conversation ID</span>
              <h3>{selectedConversation.contextId}</h3>
            </div>
          </div>
          <div className="gantt-legend">
            <span><i className="gantt-swatch request" />Request</span>
            <span><i className="gantt-swatch stream" />Stream</span>
            <span><i className="gantt-swatch response" />Response</span>
            <span><i className="gantt-swatch agent-card" />Agent card</span>
          </div>
          <div className="gantt-chart gantt-chart-flat" aria-label="Request timeline for selected conversation">
            <div className="gantt-rows">
              {chartLogs.map((log) => {
                const start = getTraceStart(log)
                const left = ((start - chartStart) / chartSpan) * 100
                const width = Math.max(2, (Math.max(log.durationMs, 1) / chartSpan) * 100)

                return (
                  <button className="gantt-row" type="button" key={log.id} onClick={() => setSelectedTrace(log)}>
                    <span className="gantt-label">
                      <strong>{log.displayText || log.label}</strong>
                      <span>{log.kind} • {new Date(start).toLocaleTimeString()}</span>
                    </span>
                    <span className="gantt-track">
                      <span
                        className={`gantt-bar ${log.kind} ${log.status}`}
                        style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}
                      />
                    </span>
                    <span className="timeline-ms">{formatDuration(log.durationMs)}</span>
                  </button>
                )
              })}
            </div>
          </div>
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
