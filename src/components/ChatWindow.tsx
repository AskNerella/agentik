import { AlertCircle, ChevronDown, Eraser, MessageSquare, PlugZap, Settings2, Trash2, Unplug, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { A2AServer, AuthMode, ChatMessage, HeaderPair } from '../types/a2a'
import { MarkdownText } from './MarkdownText'
import { McpUIRenderer } from './McpUIRenderer'
import { MessageInput } from './MessageInput'

type Props = {
  sessionTitle: string
  agentName?: string | null
  messages: ChatMessage[]
  loading: boolean
  error: string | null
  streaming: boolean
  disabled: boolean
  endpoint: string
  authMode: AuthMode
  authToken: string
  oauthToken: string
  headers: HeaderPair[]
  servers: A2AServer[]
  endpointProvided: boolean
  agentLoading: boolean
  hasSession: boolean
  contextId: string
  connectionStatus: 'checking' | 'online' | 'offline' | 'unknown'
  onEndpointChange: (value: string) => void
  onAuthModeChange: (value: AuthMode) => void
  onAuthTokenChange: (value: string) => void
  onOauthTokenChange: (value: string) => void
  onHeadersChange: (value: HeaderPair[]) => void
  onSelectServer: (server: A2AServer) => void
  onConnect: () => void
  onConnectDirect: () => void
  onDisconnect: () => void
  onStreamingChange: (enabled: boolean) => void
  onSend: (message: string) => void
  onClear: () => void
  onDeleteSession: () => void
  selectedTraceMessageId: string | null
  onSelectMessageTrace: (messageId: string | null) => void
}

export function ChatWindow({
  sessionTitle,
  agentName,
  messages,
  loading,
  error,
  streaming,
  disabled,
  endpoint,
  authMode,
  authToken,
  oauthToken,
  headers,
  servers = [],
  endpointProvided,
  agentLoading,
  hasSession,
  contextId,
  connectionStatus,
  onEndpointChange,
  onAuthModeChange,
  onAuthTokenChange,
  onOauthTokenChange,
  onHeadersChange,
  onSelectServer,
  onConnect,
  onConnectDirect,
  onDisconnect,
  onStreamingChange,
  onSend,
  onClear,
  onDeleteSession,
  selectedTraceMessageId,
  onSelectMessageTrace,
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [authMenuOpen, setAuthMenuOpen] = useState(false)
  const [serverMenuOpen, setServerMenuOpen] = useState(false)
  const [reconnectModalOpen, setReconnectModalOpen] = useState(false)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (endpointProvided) setReconnectModalOpen(false)
  }, [endpointProvided])

  const handleConnect = (event: FormEvent) => {
    event.preventDefault()
    const url = endpoint.trim().toLowerCase()
    if (url.includes('agent-card.json') || url.includes('agent.json')) {
      onConnect()
    } else {
      onConnectDirect()
    }
  }

  const addHeader = () => onHeadersChange([...headers, { id: crypto.randomUUID(), key: '', value: '' }])
  const updateHeader = (id: string, field: 'key' | 'value', value: string) => {
    onHeadersChange(headers.map((header) => (header.id === id ? { ...header, [field]: value } : header)))
  }
  const removeHeader = (id: string) => onHeadersChange(headers.filter((header) => header.id !== id))
  const authLabels: Record<AuthMode, string> = {
    none: 'No auth',
    bearer: 'Bearer token',
    oauth2: 'OAuth 2.0 access token',
  }
  const showConversation = endpointProvided || messages.length > 0
  const visibleConnectionStatus = endpointProvided ? connectionStatus : 'offline'
  const connectionLabel = endpointProvided
    ? connectionStatus === 'offline'
      ? 'Disconnected'
      : connectionStatus === 'checking'
        ? 'Checking connection...'
        : 'Connected'
    : 'Disconnected'
  const headerAgentName = agentName?.trim() || (endpointProvided ? sessionTitle : 'Agent')
  const agentServers = servers.filter((s) => s.serverKind !== 'mcp')
  const selectedServer = agentServers.find((server) => server.endpoint === endpoint)

  const renderConnectForm = ({ modal = false }: { modal?: boolean } = {}) => (
    <form className={modal ? 'reconnect-form' : 'connect-state'} onSubmit={handleConnect}>
      {!modal ? (
        <>
          <div className={`connect-icon ${agentLoading ? 'connecting' : ''}`}>
            <PlugZap size={24} />
          </div>
          <h3>Provide an Agent Card URL to begin</h3>
          <p>Fetch a valid agent card first. Once connected, messages will use the endpoint declared by that card.</p>
        </>
      ) : null}
      {agentServers.length > 0 ? (
        <div className="advanced-section">
          <span className="advanced-heading">Saved agent</span>
          <div className="auth-select connect-agent-select">
            <button type="button" onClick={() => setServerMenuOpen((open) => !open)} aria-expanded={serverMenuOpen}>
              {selectedServer?.name || 'Choose an agent'}
              <ChevronDown size={15} className={serverMenuOpen ? 'rotated' : ''} />
            </button>
            {serverMenuOpen ? (
              <div className="auth-menu">
                {agentServers.map((server) => (
                  <button
                    className={selectedServer?.id === server.id ? 'active' : ''}
                    type="button"
                    key={server.id}
                    onClick={() => {
                      onSelectServer(server)
                      setServerMenuOpen(false)
                    }}
                  >
                    {server.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="connect-input">
        <input
          type="url"
          value={endpoint}
          onChange={(event) => onEndpointChange(event.target.value)}
          placeholder="Agent card or broker URL"
          aria-label="Agent endpoint URL"
        />
        <button className="primary-button" type="submit" disabled={!endpoint.trim() || agentLoading}>
          {agentLoading ? 'Connecting...' : modal ? 'Reconnect' : 'Connect'}
        </button>
      </div>
      <div className="connect-advanced">
        <button className="advanced-toggle" type="button" onClick={() => setAdvancedOpen((open) => !open)}>
          <Settings2 size={15} />
          Advanced
          <ChevronDown size={15} className={advancedOpen ? 'rotated' : ''} />
        </button>
        {advancedOpen ? (
          <div className="advanced-popover">
            <div className="advanced-section advanced-auth-section">
              <span className="advanced-heading">Authentication</span>
              <div className="auth-select">
                <button type="button" onClick={() => setAuthMenuOpen((open) => !open)} aria-expanded={authMenuOpen}>
                  {authLabels[authMode]}
                  <ChevronDown size={15} className={authMenuOpen ? 'rotated' : ''} />
                </button>
                {authMenuOpen ? (
                  <div className="auth-menu">
                    {(['none', 'bearer', 'oauth2'] as AuthMode[]).map((mode) => (
                      <button
                        className={authMode === mode ? 'active' : ''}
                        type="button"
                        key={mode}
                        onClick={() => {
                          onAuthModeChange(mode)
                          setAuthMenuOpen(false)
                        }}
                      >
                        {authLabels[mode]}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              {authMode === 'bearer' ? (
                <input
                  type="password"
                  value={authToken}
                  onChange={(event) => onAuthTokenChange(event.target.value)}
                  placeholder="Bearer token"
                  autoComplete="off"
                />
              ) : null}
              {authMode === 'oauth2' ? (
                <input
                  type="password"
                  value={oauthToken}
                  onChange={(event) => onOauthTokenChange(event.target.value)}
                  placeholder="OAuth 2.0 access token"
                  autoComplete="off"
                />
              ) : null}
            </div>
            <div className="advanced-section advanced-headers-section">
              <div className="connect-header-tools">
                <span>Custom headers</span>
                <button type="button" onClick={addHeader}>Add header</button>
              </div>
              {headers.length > 0 ? (
                <div className="header-table">
                  <div className="header-table-head">
                    <span>Header</span>
                    <span>Value</span>
                  </div>
                  {headers.map((header) => (
                    <div className="header-table-row" key={header.id}>
                      <input value={header.key} onChange={(event) => updateHeader(header.id, 'key', event.target.value)} placeholder="Header" aria-label="Header" />
                      <input value={header.value} onChange={(event) => updateHeader(header.id, 'value', event.target.value)} placeholder="Value" aria-label="Header value" />
                      <button className="icon-button subtle" type="button" onClick={() => removeHeader(header.id)} aria-label="Remove header">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="advanced-empty">No custom headers added.</p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </form>
  )

  return (
    <section className="chat-section panel-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{headerAgentName}</span>
          <h2>{showConversation ? sessionTitle : 'Connect an agent card'}</h2>
          {showConversation ? (
            <p className="context-id">
              <span className={`status-dot status-${visibleConnectionStatus}`} aria-hidden="true" />
              {connectionLabel}
              {' · '}Context ID: {contextId}
            </p>
          ) : null}
        </div>
        <div className="chat-heading-actions">
          {endpointProvided && hasSession ? (
            <button className="icon-button" type="button" onClick={onDisconnect} aria-label="Disconnect agent">
              <Unplug size={16} />
            </button>
          ) : null}
          {!endpointProvided && hasSession && messages.length > 0 ? (
            <button className="icon-button" type="button" onClick={() => setReconnectModalOpen(true)} aria-label="Reconnect agent">
              <PlugZap size={16} />
            </button>
          ) : null}
          <button className="icon-button" type="button" onClick={onClear} aria-label="Clear messages">
            <Eraser size={17} />
          </button>
          {hasSession ? (
            <button className="icon-button" type="button" onClick={onDeleteSession} aria-label="Delete session">
              <Trash2 size={16} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="messages" ref={scrollRef}>
        {!showConversation ? (
          renderConnectForm()
        ) : endpointProvided && messages.length === 0 ? (
          <div className="empty-state conversation-empty">
            <MessageSquare size={28} />
            <p>Connected. Send a message to start testing the agent.</p>
          </div>
        ) : (
          messages.map((message) => (
            <article
              className={`message ${message.role} ${message.status === 'error' ? 'message-error' : ''} ${selectedTraceMessageId === message.id ? 'message-selected' : ''} ${message.uiResources?.length ? 'message--has-ui' : ''}`}
              key={message.id}
              onClick={message.role === 'user' ? () => onSelectMessageTrace(selectedTraceMessageId === message.id ? null : message.id) : undefined}
            >
              <div className="message-meta">
                {message.role === 'user' ? 'You' : 'Agent'}
                {message.role === 'agent' && message.status === 'error' ? (
                  <span className="message-failed-badge">
                    <AlertCircle size={12} aria-hidden="true" />
                    Failed
                  </span>
                ) : null}
              </div>
              {message.role === 'agent' && message.statusUpdates?.length ? (
                <details className="agent-status-tracker" open={!message.trackerCollapsed}>
                  <summary>Agent status tracker</summary>
                  <ol>
                    {message.statusUpdates.map((update, index) => (
                      <li key={`${message.id}-${index}`}>{update}</li>
                    ))}
                  </ol>
                </details>
              ) : null}
              <div className="message-body">
                {message.content || message.isStreaming ? (
                  <>
                    <MarkdownText content={message.content} />
                    {message.uiResources?.map((resource, idx) => (
                      <McpUIRenderer key={`${message.id}-ui-${idx}`} resource={resource} onSend={onSend} />
                    ))}
                    {message.isStreaming ? (
                      <>
                        {message.statusUpdates?.length ? (
                          <span
                            key={`${message.id}-status-${message.statusUpdates.length}`}
                            className="agent-status-latest"
                          >
                            {message.statusUpdates[message.statusUpdates.length - 1]}
                          </span>
                        ) : null}
                        <span className="thinking">
                          <span className="thinking-dots" aria-hidden="true">
                            <span />
                            <span />
                            <span />
                          </span>
                          Thinking
                        </span>
                      </>
                    ) : null}
                  </>
                ) : (
                  'Waiting for response...'
                )}
              </div>
            </article>
          ))
        )}
      </div>

      {error ? <div className="inline-error">{error}</div> : null}

      {endpointProvided ? (
        <MessageInput
          disabled={disabled || loading}
          streaming={streaming}
          onStreamingChange={onStreamingChange}
          onSend={onSend}
        />
      ) : showConversation ? (
        <div className="reconnect-footer">
          <button className="secondary-button compact-button" type="button" onClick={() => setReconnectModalOpen(true)}>
            <PlugZap size={14} />
            Reconnect
          </button>
        </div>
      ) : null}

      {reconnectModalOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setReconnectModalOpen(false)}>
          <div className="modal reconnect-modal" role="dialog" aria-modal="true" aria-label="Reconnect agent" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <h2>Reconnect agent</h2>
                <p>Choose an agent card URL and reconnect this conversation.</p>
              </div>
              <button className="icon-button subtle" type="button" onClick={() => setReconnectModalOpen(false)} aria-label="Close reconnect modal">
                <X size={15} />
              </button>
            </div>
            {renderConnectForm({ modal: true })}
          </div>
        </div>
      ) : null}
    </section>
  )
}
