import { Clock, FileJson } from 'lucide-react'
import type { TraceLog } from '../types/a2a'

type Props = {
  logs: TraceLog[]
}

function JsonBlock({ value }: { value: unknown }) {
  return <pre>{JSON.stringify(value, null, 2)}</pre>
}

export function TracePanel({ logs }: Props) {
  return (
    <section className="trace-panel">
      <div className="trace-list">
        {logs.length === 0 ? (
          <div className="empty-state trace-empty">
            <FileJson size={28} />
            <p>Request payloads, responses, status, and timing will land here.</p>
          </div>
        ) : (
          logs.map((log) => (
            <details className="trace-item" key={log.id} open={logs.length === 1}>
              <summary>
                <div>
                  <strong>{log.label}</strong>
                  <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                </div>
                <span className={`status-pill ${log.status}`}>{log.status}</span>
              </summary>
              <div className="trace-duration">
                <Clock size={14} />
                {log.durationMs} ms
              </div>
              <h3>Request</h3>
              <JsonBlock value={log.request} />
              <h3>Response</h3>
              <JsonBlock value={log.response} />
            </details>
          ))
        )}
      </div>
    </section>
  )
}
