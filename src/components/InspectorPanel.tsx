import {
  RotateCcw,
  Maximize2,
  Minimize2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { AgentArtifact, AgentCard, TraceLog } from '../types/a2a'
import type { AgentCardValidation } from '../utils/agentCardValidation'
import { ValidationStatus } from './ValidationStatus'

type Props = {
  card: AgentCard | null
  validation: AgentCardValidation
  agentError: string | null
  logs: TraceLog[]
  traceFilterLabel: string
  messageCount: number
  artifacts: AgentArtifact[]
  onReplayTrace: (trace: TraceLog) => void
  onClearTraces: () => void
  collapsed: boolean
  onToggleCollapsed: () => void
  expanded: boolean
  onToggleExpanded: () => void
}

type InspectorTab = 'analytics' | 'agent' | 'artifacts' | 'traces'
type ArtifactSort = 'newest' | 'oldest' | 'name'

function JsonBlock({ value, raw }: { value: unknown; raw?: boolean }) {
  return <pre>{typeof value === 'string' ? value : JSON.stringify(value, null, raw ? 0 : 2)}</pre>
}

function formatDuration(durationMs: number) {
  if (durationMs < 1000) return `${durationMs} ms`
  return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 2 : 1)} s`
}

export function InspectorPanel({
  card,
  validation,
  agentError,
  logs,
  traceFilterLabel,
  messageCount,
  artifacts,
  onReplayTrace,
  onClearTraces,
  collapsed,
  onToggleCollapsed,
  expanded,
  onToggleExpanded,
}: Props) {
  const [activeTab, setActiveTab] = useState<InspectorTab>('analytics')
  const [selectedTrace, setSelectedTrace] = useState<TraceLog | null>(null)
  const [rawTracePayload, setRawTracePayload] = useState(false)
  const [jsonOpen, setJsonOpen] = useState(false)
  const [expandedSkillIds, setExpandedSkillIds] = useState<Set<string>>(new Set())
  const [artifactSort, setArtifactSort] = useState<ArtifactSort>('newest')
  const longestTrace = Math.max(1, ...logs.map((log) => log.durationMs))
  const requestLogs = useMemo(() => logs.filter((log) => log.kind === 'request'), [logs])
  const streamLogs = useMemo(() => logs.filter((log) => log.kind === 'stream'), [logs])
  const visibleLogs = useMemo(() => {
    return logs
  }, [logs])
  const sortedArtifacts = useMemo(() => {
    return [...artifacts].sort((left, right) => {
      if (artifactSort === 'name') return left.name.localeCompare(right.name)

      const leftTime = new Date(left.createdAt).getTime()
      const rightTime = new Date(right.createdAt).getTime()
      return artifactSort === 'newest' ? rightTime - leftTime : leftTime - rightTime
    })
  }, [artifactSort, artifacts])

  const toggleSkill = (id: string) => {
    setExpandedSkillIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleClearTraces = () => {
    setSelectedTrace(null)
    onClearTraces()
  }

  if (collapsed) {
    return (
      <aside className="inspector-panel inspector-collapsed side-panel">
        <button className="icon-button" type="button" onClick={onToggleCollapsed} aria-label="Open inspector">
          <SlidersHorizontal size={17} />
        </button>
        <div className="rail-mark">Inspector</div>
      </aside>
    )
  }

  return (
    <aside className={`inspector-panel side-panel ${expanded ? 'inspector-expanded' : ''}`}>
      <div className="inspector-heading">
        <div>
          <span className="eyebrow">Inspector</span>
          <h2>Session context</h2>
        </div>
        <div className="inspector-heading-actions">
          <button className="icon-button" type="button" onClick={onToggleExpanded} aria-label="Expand inspector">
            {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button className="icon-button" type="button" onClick={onToggleCollapsed} aria-label="Collapse inspector">
            <SlidersHorizontal size={17} />
          </button>
        </div>
      </div>

      <div className="inspector-tabs" role="tablist" aria-label="Inspector tabs">
        <button className={activeTab === 'analytics' ? 'active' : ''} type="button" onClick={() => setActiveTab('analytics')}>
          Stats
        </button>
        <button className={activeTab === 'agent' ? 'active' : ''} type="button" onClick={() => setActiveTab('agent')}>
          Agent
        </button>
        <button className={activeTab === 'artifacts' ? 'active' : ''} type="button" onClick={() => setActiveTab('artifacts')}>
          Artifacts
        </button>
        <button className={activeTab === 'traces' ? 'active' : ''} type="button" onClick={() => setActiveTab('traces')}>
          Traces
        </button>
      </div>

      <div className="inspector-tab-content">
        {activeTab === 'analytics' ? (
          <section className="inspector-pane">
            <div className="context-card-heading">
              <h3>Analytics</h3>
            </div>
            <div className="metric-grid">
              <div className="metric-card">
                <strong>{messageCount}</strong>
                <span>Messages</span>
              </div>
              <div className="metric-card">
                <strong>{requestLogs.length}</strong>
                <span>Requests</span>
              </div>
              <div className="metric-card">
                <strong>{streamLogs.length}</strong>
                <span>Response streams</span>
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === 'agent' ? (
          <section className="inspector-pane">
            <div className="context-card-heading">
              <h3>Agent card</h3>
            </div>
            {agentError ? <div className="inline-error">{agentError}</div> : null}
            {card ? (
              <div className="agent-detail">
                <div className="agent-avatar">
                  <Sparkles size={20} />
                </div>
                <h4>{card.name}</h4>
                <p>{card.description || 'No description provided.'}</p>
                <div className="detail-list">
                  <div>
                    <span>Agent URL</span>
                    <strong>{card.url || card.endpoint}</strong>
                  </div>
                  <div>
                    <span>Skills</span>
                    <strong>{card.skills.length}</strong>
                  </div>
                </div>
                <ValidationStatus validation={validation} />
                <div className="skill-list">
                  {card.skills.map((skill, index) => {
                    const skillId = `${skill.name}-${index}`
                    const expanded = expandedSkillIds.has(skillId)
                    const description = skill.description || 'No description provided.'

                    return (
                      <article key={skillId}>
                        <strong>{skill.name}</strong>
                        <p className={`skill-description ${expanded ? 'expanded' : ''}`}>{description}</p>
                        {description.length > 110 ? (
                          <button className="text-button" type="button" onClick={() => toggleSkill(skillId)}>
                            {expanded ? 'Show less' : 'Show more'}
                          </button>
                        ) : null}
                      </article>
                    )
                  })}
                </div>
                <button className="secondary-button" type="button" onClick={() => setJsonOpen(true)}>
                  View original JSON
                </button>
              </div>
            ) : (
              <div className="inspector-empty">No Information</div>
            )}
          </section>
        ) : null}

        {activeTab === 'artifacts' ? (
          <section className="inspector-pane">
            <div className="context-card-heading">
              <h3>Artifacts</h3>
              <label className="compact-select">
                <span>Sort</span>
                <select value={artifactSort} onChange={(event) => setArtifactSort(event.target.value as ArtifactSort)}>
                  <option value="newest">Latest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="name">Name</option>
                </select>
              </label>
            </div>
            {sortedArtifacts.length === 0 ? (
              <div className="inspector-empty">No Information</div>
            ) : (
              <div className="artifact-list">
                {sortedArtifacts.map((artifact) => (
                  <article key={artifact.id}>
                    <strong>{artifact.name}</strong>
                    <span>{new Date(artifact.createdAt).toLocaleTimeString()}</span>
                    <p>{artifact.content}</p>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {activeTab === 'traces' ? (
          <section className="inspector-pane">
            <div className="context-card-heading">
              <div>
                <h3>Traces</h3>
                <p className="trace-context-label">{traceFilterLabel}</p>
              </div>
              <button className="icon-button subtle no-tooltip" type="button" onClick={handleClearTraces} aria-label="Clear traces">
                <Trash2 size={15} />
              </button>
            </div>
            {visibleLogs.length === 0 ? (
              <div className="inspector-empty">No Information</div>
            ) : (
              <div className="timeline">
                {visibleLogs.map((log) => (
                  <button className="timeline-item" type="button" key={log.id} onClick={() => setSelectedTrace(log)}>
                    <span className={`timeline-dot ${log.status}`} />
                    <span className="timeline-copy">
                      <strong>{log.displayText || log.label}</strong>
                      <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                    </span>
                    <span className="timeline-bar">
                      <span style={{ width: `${Math.max(8, (log.durationMs / longestTrace) * 100)}%` }} />
                    </span>
                    <span className="timeline-ms">{formatDuration(log.durationMs)}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </div>

      {jsonOpen && card ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setJsonOpen(false)}>
          <div className="modal json-modal" role="dialog" aria-modal="true" aria-label="Original agent card JSON" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <h2>Original agent card JSON</h2>
              <button className="icon-button subtle" type="button" onClick={() => setJsonOpen(false)} aria-label="Close JSON modal">
                <X size={15} />
              </button>
            </div>
            <JsonBlock value={card} />
          </div>
        </div>
      ) : null}

      {selectedTrace ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedTrace(null)}>
          <div className="modal trace-modal" role="dialog" aria-modal="true" aria-label="Trace details" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading trace-modal-heading">
              <div>
                <h2>{selectedTrace.label}</h2>
                <p>{formatDuration(selectedTrace.durationMs)}</p>
                {selectedTrace.contextId ? <p>Context: {selectedTrace.contextId}</p> : null}
                {selectedTrace.requestTimestamp ? (
                  <p>Request sent: {new Date(selectedTrace.requestTimestamp).toLocaleTimeString()}</p>
                ) : null}
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
            </div>
            {selectedTrace.kind === 'request' ? (
              <button className="secondary-button trace-replay-button" type="button" onClick={() => onReplayTrace(selectedTrace)}>
                <RotateCcw size={14} />
                Replay Event
              </button>
            ) : null}
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
    </aside>
  )
}
