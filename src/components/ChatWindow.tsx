import { Eraser, Loader2, MessageSquare, PlugZap } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { FormEvent } from 'react'
import type { A2AServer, ChatMessage } from '../types/a2a'
import { MarkdownText } from './MarkdownText'
import { MessageInput } from './MessageInput'

type Props = {
  sessionTitle: string
  messages: ChatMessage[]
  loading: boolean
  error: string | null
  streaming: boolean
  disabled: boolean
  endpoint: string
  endpointProvided: boolean
  agentLoading: boolean
  servers: A2AServer[]
  contextId: string
  onEndpointChange: (value: string) => void
  onSelectServer: (server: A2AServer) => void
  onConnect: () => void
  onStreamingChange: (enabled: boolean) => void
  onSend: (message: string) => void
  onClear: () => void
  selectedTraceMessageId: string | null
  onSelectMessageTrace: (messageId: string | null) => void
}

export function ChatWindow({
  sessionTitle,
  messages,
  loading,
  error,
  streaming,
  disabled,
  endpoint,
  endpointProvided,
  agentLoading,
  servers,
  contextId,
  onEndpointChange,
  onSelectServer,
  onConnect,
  onStreamingChange,
  onSend,
  onClear,
  selectedTraceMessageId,
  onSelectMessageTrace,
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const handleConnect = (event: FormEvent) => {
    event.preventDefault()
    onConnect()
  }

  return (
    <section className="chat-section panel-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">A2A Playground</span>
          <h2>{endpointProvided ? sessionTitle : 'Connect an agent card'}</h2>
          {endpointProvided ? <p className="context-id">Context ID: {contextId}</p> : null}
        </div>
        <div className="chat-heading-actions">
          <button className="icon-button" type="button" onClick={onClear} aria-label="Clear messages">
            <Eraser size={17} />
          </button>
        </div>
      </div>

      <div className="messages" ref={scrollRef}>
        {!endpointProvided ? (
          <form className="connect-state" onSubmit={handleConnect}>
            <div className="connect-icon">
              <PlugZap size={24} />
            </div>
            <h3>Provide an Agent Card URL to begin</h3>
            <p>Fetch a valid agent card first. Once connected, messages will use the endpoint declared by that card.</p>
            <div className="connect-input">
              <input
                type="url"
                value={endpoint}
                onChange={(event) => onEndpointChange(event.target.value)}
                placeholder="https://agent.example.com/.well-known/agent-card.json"
                aria-label="Agent Card URL"
              />
              <button className="primary-button" type="submit" disabled={!endpoint.trim() || agentLoading}>
                {agentLoading ? 'Connecting...' : 'Connect'}
              </button>
            </div>
            {servers.length > 0 ? (
              <div className="saved-server-picker">
                <span>Saved servers</span>
                <div>
                  {servers.map((server) => (
                    <button type="button" key={server.id} onClick={() => onSelectServer(server)}>
                      {server.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </form>
        ) : messages.length === 0 ? (
          <div className="empty-state conversation-empty">
            <MessageSquare size={28} />
            <p>Connected. Send a message to start testing the agent.</p>
          </div>
        ) : (
          messages.map((message) => (
            <article
              className={`message ${message.role} ${message.status === 'error' ? 'message-error' : ''} ${selectedTraceMessageId === message.id ? 'message-selected' : ''}`}
              key={message.id}
              onClick={message.role === 'user' ? () => onSelectMessageTrace(selectedTraceMessageId === message.id ? null : message.id) : undefined}
            >
              <div className="message-meta">{message.role === 'user' ? 'You' : 'Agent'}</div>
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
                    {message.isStreaming ? (
                      <span className="thinking">
                        <Loader2 size={14} className="spin" />
                        Thinking...
                      </span>
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
      ) : null}
    </section>
  )
}
