import {
  AlertCircle,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Database,
  Eraser,
  FileText,
  Info,
  Loader2,
  PlugZap,
  RotateCcw,
  Search,
  Settings2,
  Trash2,
  Unplug,
  Wrench,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type {
  A2AServer,
  AuthMode,
  ChatMessage,
  HeaderPair,
  McpPrompt,
  McpResource,
  McpServerInfo,
  McpTool,
  McpToolProperty,
} from '../types/a2a'

type McpTab = 'tools' | 'resources' | 'prompts'

type Props = {
  sessionTitle: string
  messages: ChatMessage[]
  endpoint: string
  authMode: AuthMode
  authToken: string
  oauthToken: string
  headers: HeaderPair[]
  servers: A2AServer[]
  endpointProvided: boolean
  agentLoading: boolean
  hasSession: boolean
  mcpServerInfo: McpServerInfo | null
  mcpTools: McpTool[]
  mcpResources: McpResource[]
  mcpPrompts: McpPrompt[]
  onEndpointChange: (value: string) => void
  onAuthModeChange: (value: AuthMode) => void
  onAuthTokenChange: (value: string) => void
  onOauthTokenChange: (value: string) => void
  onHeadersChange: (value: HeaderPair[]) => void
  onSelectMcpServer: (server: A2AServer) => void
  onConnect: () => void
  onDisconnect: () => void
  onCallTool: (name: string, args: Record<string, unknown>) => void
  onReadResource: (uri: string, name: string) => void
  onRunPrompt: (name: string, args: Record<string, string>) => void
  onClearMessage: (id: string) => void
  onClear: () => void
  onDeleteSession: () => void
}

// ─── Utility: render a single JSON-schema property as a form field ────────────
function SchemaField({
  name,
  prop,
  required,
  value,
  onChange,
}: {
  name: string
  prop: McpToolProperty
  required: boolean
  value: unknown
  onChange: (v: unknown) => void
}) {
  const label = `${name}${required ? ' *' : ''}`

  if (prop.enum) {
    return (
      <label className="mcp-field">
        <span className="mcp-field-label">
          {label}
          {prop.description ? <em>{prop.description}</em> : null}
        </span>
        <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
          <option value="">— select —</option>
          {prop.enum.map((v) => (
            <option key={String(v)} value={String(v)}>
              {String(v)}
            </option>
          ))}
        </select>
      </label>
    )
  }

  if (prop.type === 'boolean') {
    return (
      <label className="mcp-field mcp-field-check">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="mcp-field-label">
          {label}
          {prop.description ? <em>{prop.description}</em> : null}
        </span>
      </label>
    )
  }

  if (prop.type === 'number' || prop.type === 'integer') {
    return (
      <label className="mcp-field">
        <span className="mcp-field-label">
          {label}
          {prop.description ? <em>{prop.description}</em> : null}
        </span>
        <input
          type="number"
          value={String(value ?? '')}
          placeholder={prop.default !== undefined ? String(prop.default) : ''}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        />
      </label>
    )
  }

  if (prop.type === 'array' || prop.type === 'object') {
    return (
      <label className="mcp-field">
        <span className="mcp-field-label">
          {label} <code>{prop.type} (JSON)</code>
          {prop.description ? <em>{prop.description}</em> : null}
        </span>
        <textarea
          className="mcp-json-input"
          rows={3}
          value={String(value ?? '')}
          placeholder={`Enter ${prop.type} as JSON`}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    )
  }

  return (
    <label className="mcp-field">
      <span className="mcp-field-label">
        {label}
        {prop.description ? <em>{prop.description}</em> : null}
      </span>
      <input
        type="text"
        value={String(value ?? '')}
        placeholder={prop.default !== undefined ? String(prop.default) : ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

// ─── Tool call form ────────────────────────────────────────────────────────────
function ToolForm({
  tool,
  onCall,
  onClose,
  loading,
  initialArgs = {},
}: {
  tool: McpTool
  onCall: (args: Record<string, unknown>) => void
  onClose: () => void
  loading: boolean
  initialArgs?: Record<string, unknown>
}) {
  const props = tool.inputSchema?.properties ?? {}
  const required = tool.inputSchema?.required ?? []
  const [args, setArgs] = useState<Record<string, unknown>>(() => {
    const defaults = Object.fromEntries(Object.entries(props).map(([k, p]) => [k, p.default ?? '']))
    return { ...defaults, ...initialArgs }
  })

  const setField = (name: string, value: unknown) =>
    setArgs((prev) => ({ ...prev, [name]: value }))

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    // Parse JSON fields and clean up empty optional strings
    const coerced: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(args)) {
      const prop = props[k]
      if ((prop?.type === 'array' || prop?.type === 'object') && typeof v === 'string') {
        try {
          coerced[k] = JSON.parse(v)
        } catch {
          coerced[k] = v
        }
      } else if (v === '' && !required.includes(k)) {
        // omit optional empty strings
      } else {
        coerced[k] = v
      }
    }
    onCall(coerced)
  }

  const hasProps = Object.keys(props).length > 0

  return (
    <form className="mcp-tool-form" onSubmit={handleSubmit}>
      <div className="mcp-tool-form-header">
        <div>
          <strong>{tool.name}</strong>
          {tool.description ? <p className="mcp-tool-form-desc">{tool.description}</p> : null}
        </div>
        <button className="icon-button subtle" type="button" onClick={onClose} aria-label="Close tool form">
          <X size={15} />
        </button>
      </div>
      {hasProps ? (
        <div className="mcp-fields">
          {Object.entries(props).map(([name, prop]) => (
            <SchemaField
              key={name}
              name={name}
              prop={prop}
              required={required.includes(name)}
              value={args[name]}
              onChange={(v) => setField(name, v)}
            />
          ))}
        </div>
      ) : (
        <p className="mcp-no-args">This tool takes no arguments.</p>
      )}
      <div className="mcp-tool-form-actions">
        <button className="primary-button" type="submit" disabled={loading}>
          {loading ? (
            <>
              <Loader2 size={14} className="mcp-spin" />
              Calling…
            </>
          ) : (
            <>
              <Wrench size={14} />
              Call tool
            </>
          )}
        </button>
      </div>
    </form>
  )
}

// ─── Connect form ─────────────────────────────────────────────────────────────
function McpConnectForm({
  endpoint,
  authMode,
  authToken,
  oauthToken,
  headers,
  servers,
  agentLoading,
  onEndpointChange,
  onAuthModeChange,
  onAuthTokenChange,
  onOauthTokenChange,
  onHeadersChange,
  onSelectMcpServer,
  onConnect,
}: Pick<
  Props,
  | 'endpoint'
  | 'authMode'
  | 'authToken'
  | 'oauthToken'
  | 'headers'
  | 'servers'
  | 'agentLoading'
  | 'onEndpointChange'
  | 'onAuthModeChange'
  | 'onAuthTokenChange'
  | 'onOauthTokenChange'
  | 'onHeadersChange'
  | 'onSelectMcpServer'
  | 'onConnect'
>) {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [authMenuOpen, setAuthMenuOpen] = useState(false)
  const [serverMenuOpen, setServerMenuOpen] = useState(false)
  const authLabels: Record<AuthMode, string> = {
    none: 'No auth',
    bearer: 'Bearer token',
    oauth2: 'OAuth 2.0 access token',
  }
  const mcpServers = servers.filter((s) => s.serverKind === 'mcp')
  const selectedServer = mcpServers.find((s) => s.endpoint === endpoint)

  const addHeader = () =>
    onHeadersChange([...headers, { id: crypto.randomUUID(), key: '', value: '' }])
  const updateHeader = (id: string, field: 'key' | 'value', value: string) =>
    onHeadersChange(
      headers.map((h) => (h.id === id ? { ...h, [field]: value } : h)),
    )
  const removeHeader = (id: string) =>
    onHeadersChange(headers.filter((h) => h.id !== id))

  return (
    <form
      className="connect-state"
      onSubmit={(e) => {
        e.preventDefault()
        onConnect()
      }}
    >
      <div className={`connect-icon ${agentLoading ? 'connecting' : ''}`}>
        <PlugZap size={24} />
      </div>
      <h3>Connect an MCP Server</h3>
      <p>
        Enter the MCP server endpoint URL. Agentik will initialize the connection and discover
        available tools, resources, and prompts.
      </p>
      {mcpServers.length > 0 ? (
        <div className="advanced-section saved-mcp-server-section">
          <span className="advanced-heading">Saved MCP server</span>
          <div className="auth-select connect-agent-select">
            <button type="button" onClick={() => setServerMenuOpen((o) => !o)} aria-expanded={serverMenuOpen}>
              {selectedServer?.name || 'Choose a server'}
              <ChevronDown size={15} className={serverMenuOpen ? 'rotated' : ''} />
            </button>
            {serverMenuOpen ? (
              <div className="auth-menu">
                {mcpServers.map((server) => (
                  <button
                    className={selectedServer?.id === server.id ? 'active' : ''}
                    type="button"
                    key={server.id}
                    onClick={() => {
                      onSelectMcpServer(server)
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
          onChange={(e) => onEndpointChange(e.target.value)}
          placeholder="https://mcp.example.com/"
          aria-label="MCP server URL"
        />
        <button
          className="primary-button"
          type="submit"
          disabled={!endpoint.trim() || agentLoading}
        >
          {agentLoading ? 'Connecting…' : 'Connect'}
        </button>
      </div>
      <div className="connect-advanced">
        <button
          className="advanced-toggle"
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
        >
          <Settings2 size={15} />
          Advanced
          <ChevronDown size={15} className={advancedOpen ? 'rotated' : ''} />
        </button>
        {advancedOpen ? (
          <div className="advanced-popover">
            <div className="advanced-section advanced-auth-section">
              <span className="advanced-heading">Authentication</span>
              <div className="auth-select">
                <button
                  type="button"
                  onClick={() => setAuthMenuOpen((o) => !o)}
                  aria-expanded={authMenuOpen}
                >
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
                  onChange={(e) => onAuthTokenChange(e.target.value)}
                  placeholder="Bearer token"
                  autoComplete="off"
                />
              ) : null}
              {authMode === 'oauth2' ? (
                <input
                  type="password"
                  value={oauthToken}
                  onChange={(e) => onOauthTokenChange(e.target.value)}
                  placeholder="OAuth 2.0 access token"
                  autoComplete="off"
                />
              ) : null}
            </div>
            <div className="advanced-section advanced-headers-section">
              <div className="connect-header-tools">
                <span>Custom headers</span>
                <button type="button" onClick={addHeader}>
                  Add header
                </button>
              </div>
              {headers.length > 0 ? (
                <div className="header-table">
                  <div className="header-table-head">
                    <span>Header</span>
                    <span>Value</span>
                  </div>
                  {headers.map((h) => (
                    <div className="header-table-row" key={h.id}>
                      <input
                        value={h.key}
                        onChange={(e) => updateHeader(h.id, 'key', e.target.value)}
                        placeholder="Header"
                        aria-label="Header name"
                      />
                      <input
                        value={h.value}
                        onChange={(e) => updateHeader(h.id, 'value', e.target.value)}
                        placeholder="Value"
                        aria-label="Header value"
                      />
                      <button
                        className="icon-button subtle"
                        type="button"
                        onClick={() => removeHeader(h.id)}
                        aria-label="Remove header"
                      >
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
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.trim().length / 4))
}

function tryParseJson(text: string): unknown | null {
  try {
    const parsed: unknown = JSON.parse(text)
    if (parsed !== null && (typeof parsed === 'object' || Array.isArray(parsed))) return parsed
    return null
  } catch {
    return null
  }
}

// ─── JSON syntax highlighter ──────────────────────────────────────────────────
function JsonNode({ value }: { value: unknown }) {
  if (value === null) return <span className="json-null">null</span>
  if (value === undefined) return <span className="json-null">undefined</span>
  if (typeof value === 'boolean') return <span className="json-bool">{String(value)}</span>
  if (typeof value === 'number') return <span className="json-number">{String(value)}</span>
  if (typeof value === 'string') {
    return (
      <span className="json-string">
        <span className="json-quote">&quot;</span>
        {value}
        <span className="json-quote">&quot;</span>
      </span>
    )
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="json-punct">[]</span>
    return (
      <>
        <span className="json-punct">{'['}</span>
        <div className="json-indent">
          {value.map((item, i) => (
            <div key={i}>
              <JsonNode value={item} />
              {i < value.length - 1 ? <span className="json-punct">,</span> : null}
            </div>
          ))}
        </div>
        <span className="json-punct">{']'}</span>
      </>
    )
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return <span className="json-punct">{'{}'}</span>
    return (
      <>
        <span className="json-punct">{'{'}</span>
        <div className="json-indent">
          {entries.map(([key, val], i) => (
            <div key={key}>
              <span className="json-key">&quot;{key}&quot;</span>
              <span className="json-punct">: </span>
              <JsonNode value={val} />
              {i < entries.length - 1 ? <span className="json-punct">,</span> : null}
            </div>
          ))}
        </div>
        <span className="json-punct">{'}'}</span>
      </>
    )
  }
  return <span>{String(value)}</span>
}

function isHtmlContent(content: string): boolean {
  if (!content) return false
  const trimmed = content.trimStart()
  return (
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<svg') ||
    (trimmed.startsWith('<') && /<head[\s>]|<body[\s>]/i.test(trimmed))
  )
}

// ─── Main component ────────────────────────────────────────────────────────────
export function McpChatWindow({
  sessionTitle,
  messages,
  endpoint,
  authMode,
  authToken,
  oauthToken,
  headers,
  servers,
  endpointProvided,
  agentLoading,
  hasSession,
  mcpServerInfo,
  mcpTools,
  mcpResources,
  mcpPrompts,
  onEndpointChange,
  onAuthModeChange,
  onAuthTokenChange,
  onOauthTokenChange,
  onHeadersChange,
  onSelectMcpServer,
  onConnect,
  onDisconnect,
  onCallTool,
  onReadResource,
  onRunPrompt,
  onClearMessage,
  onClear,
  onDeleteSession,
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const workspaceRef = useRef<HTMLDivElement | null>(null)
  const [activeTab, setActiveTab] = useState<McpTab>('tools')
  const [toolSearch, setToolSearch] = useState('')
  const [selectedTool, setSelectedTool] = useState<McpTool | null>(null)
  const [callingTool, setCallingTool] = useState(false)
  const [resourceSearch, setResourceSearch] = useState('')
  const [expandedMessage, setExpandedMessage] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [msgView, setMsgView] = useState<Record<string, 'preview' | 'raw'>>({})
  const [browserWidth, setBrowserWidth] = useState(300)
  const [isDragging, setIsDragging] = useState(false)
  const [tokenInfoTool, setTokenInfoTool] = useState<McpTool | null>(null)
  const [selectedToolArgs, setSelectedToolArgs] = useState<Record<string, unknown>>({})  // Auto-expand the latest result whenever messages update
  useEffect(() => {
    const last = [...messages].reverse().find((m) => m.role === 'agent' && !m.isStreaming)
    if (last) setExpandedMessage(last.id)
  }, [messages])
  const [promptArgs, setPromptArgs] = useState<Record<string, Record<string, string>>>({})
  const [runningPrompt, setRunningPrompt] = useState<string | null>(null)

  // Drag-to-resize the browser panel
  useEffect(() => {
    if (!isDragging) return
    const handleMouseMove = (e: MouseEvent) => {
      if (!workspaceRef.current) return
      const rect = workspaceRef.current.getBoundingClientRect()
      const newWidth = Math.max(200, Math.min(560, e.clientX - rect.left))
      setBrowserWidth(newWidth)
    }
    const handleMouseUp = () => setIsDragging(false)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  const filteredTools = useMemo(
    () =>
      mcpTools.filter(
        (t) =>
          !toolSearch ||
          t.name.toLowerCase().includes(toolSearch.toLowerCase()) ||
          t.description?.toLowerCase().includes(toolSearch.toLowerCase()),
      ),
    [mcpTools, toolSearch],
  )

  const filteredResources = useMemo(
    () =>
      mcpResources.filter(
        (r) =>
          !resourceSearch ||
          r.name.toLowerCase().includes(resourceSearch.toLowerCase()) ||
          r.uri.toLowerCase().includes(resourceSearch.toLowerCase()),
      ),
    [mcpResources, resourceSearch],
  )

  const handleCallTool = async (name: string, args: Record<string, unknown>) => {
    setCallingTool(true)
    try {
      onCallTool(name, args)
    } finally {
      setCallingTool(false)
      setSelectedTool(null)
      // Scroll to bottom after a brief delay for message to appear
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
      }, 100)
    }
  }

  const copyContent = (id: string, text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1500)
    })
  }

  const hasCapability = (cap: keyof NonNullable<McpServerInfo['capabilities']>) =>
    mcpServerInfo?.capabilities ? cap in mcpServerInfo.capabilities : true

  const handleRunPrompt = (prompt: McpPrompt) => {
    const args = promptArgs[prompt.name] ?? {}
    setRunningPrompt(prompt.name)
    try {
      onRunPrompt(prompt.name, args)
    } finally {
      setRunningPrompt(null)
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
      }, 100)
    }
  }

  const handleRerunCall = (msg: { rawJson?: unknown }) => {
    const raw = msg.rawJson as { params?: { name?: string; arguments?: Record<string, unknown> } } | undefined
    const toolName = raw?.params?.name
    const args = raw?.params?.arguments ?? {}
    const tool = mcpTools.find((t) => t.name === toolName)
    if (tool) {
      setSelectedToolArgs(args)
      setSelectedTool(tool)
    }
  }

  return (
    <section className="chat-section panel-section mcp-chat-section">
      {/* ── Header ── */}
      <div className="section-heading">
        <div>
          <span className="eyebrow mcp-eyebrow">
            <Database size={12} />
            MCP Server
          </span>
          <h2>{endpointProvided ? (mcpServerInfo?.name ?? sessionTitle) : 'Connect an MCP Server'}</h2>
          {endpointProvided && mcpServerInfo ? (
            <p className="context-id">
              <span className="status-dot status-online" aria-hidden="true" />
              Connected · v{mcpServerInfo.version}
              {' · '}
              {mcpTools.length} tool{mcpTools.length !== 1 ? 's' : ''}
              {mcpResources.length > 0 ? ` · ${mcpResources.length} resource${mcpResources.length !== 1 ? 's' : ''}` : ''}
              {mcpPrompts.length > 0 ? ` · ${mcpPrompts.length} prompt${mcpPrompts.length !== 1 ? 's' : ''}` : ''}
            </p>
          ) : null}
        </div>
        <div className="chat-heading-actions">
          {endpointProvided ? (
            <button
              className="icon-button"
              type="button"
              onClick={onDisconnect}
              aria-label="Disconnect MCP server"
            >
              <Unplug size={16} />
            </button>
          ) : null}
          <button className="icon-button" type="button" onClick={onClear} aria-label="Clear history">
            <Eraser size={17} />
          </button>
          {hasSession ? (
            <button
              className="icon-button"
              type="button"
              onClick={onDeleteSession}
              aria-label="Delete session"
            >
              <Trash2 size={16} />
            </button>
          ) : null}
        </div>
      </div>

      {/* ── Body ── */}
      {!endpointProvided ? (
        <div className="messages">
          <McpConnectForm
            endpoint={endpoint}
            authMode={authMode}
            authToken={authToken}
            oauthToken={oauthToken}
            headers={headers}
            servers={servers}
            agentLoading={agentLoading}
            onEndpointChange={onEndpointChange}
            onAuthModeChange={onAuthModeChange}
            onAuthTokenChange={onAuthTokenChange}
            onOauthTokenChange={onOauthTokenChange}
            onHeadersChange={onHeadersChange}
            onSelectMcpServer={onSelectMcpServer}
            onConnect={onConnect}
          />
        </div>
      ) : (
        <div
          className={`mcp-workspace${isDragging ? ' mcp-workspace-dragging' : ''}`}
          ref={workspaceRef}
          style={{ gridTemplateColumns: `${browserWidth}px 6px 1fr` }}
        >
          {/* ── Left: browser panel ── */}
          <div className="mcp-browser">
            {/* Tab strip */}
            <div className="mcp-tabs">
              <button
                className={activeTab === 'tools' ? 'active' : ''}
                type="button"
                onClick={() => setActiveTab('tools')}
                title={`${mcpTools.length} tools`}
              >
                <Wrench size={13} />
                Tools
                <span className="mcp-badge">{mcpTools.length}</span>
              </button>
              {hasCapability('resources') || mcpResources.length > 0 ? (
                <button
                  className={activeTab === 'resources' ? 'active' : ''}
                  type="button"
                  onClick={() => setActiveTab('resources')}
                  title={`${mcpResources.length} resources`}
                >
                  <FileText size={13} />
                  Resources
                  {mcpResources.length > 0 ? (
                    <span className="mcp-badge">{mcpResources.length}</span>
                  ) : null}
                </button>
              ) : null}
              {hasCapability('prompts') || mcpPrompts.length > 0 ? (
                <button
                  className={activeTab === 'prompts' ? 'active' : ''}
                  type="button"
                  onClick={() => setActiveTab('prompts')}
                  title={`${mcpPrompts.length} prompts`}
                >
                  <BookOpen size={13} />
                  Prompts
                  {mcpPrompts.length > 0 ? (
                    <span className="mcp-badge">{mcpPrompts.length}</span>
                  ) : null}
                </button>
              ) : null}
            </div>

            {/* ── Tools tab ── */}
            {activeTab === 'tools' ? (
              <>
                <div className="mcp-search-wrap">
                  <Search size={13} className="mcp-search-icon" />
                  <input
                    className="mcp-search"
                    type="search"
                    placeholder="Search tools…"
                    value={toolSearch}
                    onChange={(e) => setToolSearch(e.target.value)}
                  />
                </div>

                <div className="mcp-list">
                  {filteredTools.length === 0 ? (
                    <div className="mcp-empty">
                      {toolSearch ? 'No tools match your search.' : 'No tools available.'}
                    </div>
                  ) : (
                    filteredTools.map((tool) => {
                      const nameTokens = estimateTokens(tool.name)
                      const descTokens = estimateTokens(tool.description ?? '')
                      const totalTokens = nameTokens + descTokens
                      return (
                        <div key={tool.name} className="mcp-tool-row">
                          <button
                            className="mcp-list-item"
                            type="button"
                            onClick={() => setSelectedTool(tool)}
                          >
                            <div className="mcp-list-item-icon">
                              <Wrench size={13} />
                            </div>
                            <div className="mcp-list-item-body">
                              <strong>{tool.name}</strong>
                              {tool.description ? <span>{tool.description}</span> : null}
                            </div>
                            <span className="mcp-token-badge">~{totalTokens} tok</span>
                            <ChevronRight size={14} className="mcp-list-item-chevron" />
                          </button>
                          <button
                            className="mcp-info-btn"
                            type="button"
                            onClick={() => setTokenInfoTool(tool)}
                            aria-label="Show token usage info"
                            title="Token usage info"
                          >
                            <Info size={12} />
                          </button>
                        </div>
                      )
                    })
                  )}
                </div>
              </>
            ) : null}

            {/* ── Resources tab ── */}
            {activeTab === 'resources' ? (
              <>
                <div className="mcp-search-wrap">
                  <Search size={13} className="mcp-search-icon" />
                  <input
                    className="mcp-search"
                    type="search"
                    placeholder="Search resources…"
                    value={resourceSearch}
                    onChange={(e) => setResourceSearch(e.target.value)}
                  />
                </div>
                <div className="mcp-list">
                  {filteredResources.length === 0 ? (
                    <div className="mcp-empty">
                      {resourceSearch
                        ? 'No resources match your search.'
                        : 'No resources available.'}
                    </div>
                  ) : (
                    filteredResources.map((resource) => (
                      <button
                        key={resource.uri}
                        className="mcp-list-item"
                        type="button"
                        onClick={() => onReadResource(resource.uri, resource.name)}
                      >
                        <div className="mcp-list-item-icon">
                          <FileText size={13} />
                        </div>
                        <div className="mcp-list-item-body">
                          <strong>{resource.name}</strong>
                          <span>{resource.uri}</span>
                          {resource.description ? <span>{resource.description}</span> : null}
                        </div>
                        <ChevronRight size={14} className="mcp-list-item-chevron" />
                      </button>
                    ))
                  )}
                </div>
              </>
            ) : null}

            {/* ── Prompts tab ── */}
            {activeTab === 'prompts' ? (
              <div className="mcp-list">
                {mcpPrompts.length === 0 ? (
                  <div className="mcp-empty">No prompts available.</div>
                ) : (
                  mcpPrompts.map((prompt) => (
                    <div key={prompt.name} className="mcp-prompt-item">
                      <div className="mcp-prompt-header">
                        <div className="mcp-list-item-icon">
                          <BookOpen size={13} />
                        </div>
                        <div className="mcp-list-item-body">
                          <strong>{prompt.name}</strong>
                          {prompt.description ? <span>{prompt.description}</span> : null}
                        </div>
                      </div>
                      {prompt.arguments && prompt.arguments.length > 0 ? (
                        <div className="mcp-fields">
                          {prompt.arguments.map((arg) => (
                            <label key={arg.name} className="mcp-field">
                              <span className="mcp-field-label">
                                {arg.name}
                                {arg.required ? ' *' : ''}
                                {arg.description ? <em>{arg.description}</em> : null}
                              </span>
                              <input
                                type="text"
                                value={promptArgs[prompt.name]?.[arg.name] ?? ''}
                                onChange={(e) =>
                                  setPromptArgs((prev) => ({
                                    ...prev,
                                    [prompt.name]: {
                                      ...(prev[prompt.name] ?? {}),
                                      [arg.name]: e.target.value,
                                    },
                                  }))
                                }
                              />
                            </label>
                          ))}
                        </div>
                      ) : null}
                      <button
                        className="primary-button mcp-run-prompt"
                        type="button"
                        disabled={runningPrompt === prompt.name}
                        onClick={() => handleRunPrompt(prompt)}
                      >
                        {runningPrompt === prompt.name ? (
                          <Loader2 size={14} className="mcp-spin" />
                        ) : (
                          <BookOpen size={14} />
                        )}
                        Run prompt
                      </button>
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </div>

          {/* ── Resize handle ── */}
          <div
            className="mcp-resize-handle"
            onMouseDown={(e) => { e.preventDefault(); setIsDragging(true) }}
            aria-hidden="true"
          />

          {/* ── Right: history ── */}
          <div className="mcp-history" ref={scrollRef}>
            {messages.length === 0 ? (
              <div className="mcp-history-empty">
                <Wrench size={28} />
                <p>Select a tool or resource from the panel to get started.</p>
              </div>
            ) : (
              messages.map((msg) => {
                const isExpanded = expandedMessage === msg.id
                const isToolCall = msg.role === 'user'
                const isResult = msg.role === 'agent'
                const view = msgView[msg.id] ?? 'preview'
                const hasRaw = isResult && msg.rawJson !== undefined
                const parsedJson = isResult && !msg.isStreaming && view === 'preview'
                  ? tryParseJson(msg.content)
                  : null

                return (
                  <article
                    key={msg.id}
                    className={`mcp-message ${isToolCall ? 'mcp-message-call' : 'mcp-message-result'} ${msg.status === 'error' ? 'mcp-message-error' : ''}`}
                  >
                    <div className="mcp-message-header">
                      <span className="mcp-message-label">
                        {isToolCall ? (
                          <>
                            <Wrench size={11} /> Call
                          </>
                        ) : msg.status === 'error' ? (
                          <>
                            <AlertCircle size={11} /> Error
                          </>
                        ) : (
                          <>
                            <ChevronDown size={11} /> Result
                          </>
                        )}
                      </span>
                      <div className="mcp-message-actions">
                        {isResult && hasRaw && !msg.isStreaming ? (
                          <div className="mcp-view-toggle">
                            <button
                              className={view === 'preview' ? 'active' : ''}
                              type="button"
                              onClick={() => setMsgView((v) => ({ ...v, [msg.id]: 'preview' }))}
                            >
                              Preview
                            </button>
                            <button
                              className={view === 'raw' ? 'active' : ''}
                              type="button"
                              onClick={() => setMsgView((v) => ({ ...v, [msg.id]: 'raw' }))}
                            >
                              Raw
                            </button>
                          </div>
                        ) : null}
                        {msg.content && isResult && msg.content.length > 300 ? (
                          <button
                            className="mcp-msg-btn"
                            type="button"
                            onClick={() => setExpandedMessage(isExpanded ? null : msg.id)}
                          >
                            {isExpanded ? 'Collapse' : 'Expand'}
                          </button>
                        ) : null}
                        {msg.content ? (
                          <button
                            className="mcp-msg-btn"
                            type="button"
                            onClick={() => copyContent(msg.id, msg.content)}
                            title="Copy to clipboard"
                          >
                            {copiedId === msg.id ? 'Copied!' : <Copy size={12} />}
                          </button>
                        ) : null}
                        {isToolCall ? (
                          <>
                            <button
                              className="mcp-msg-btn mcp-msg-btn-rerun"
                              type="button"
                              onClick={() => handleRerunCall(msg)}
                              title="Edit & re-run"
                              aria-label="Edit and re-run this call"
                            >
                              <RotateCcw size={12} />
                              Re-run
                            </button>
                            <button
                              className="mcp-msg-btn"
                              type="button"
                              onClick={() => onClearMessage(msg.id)}
                              title="Remove this request"
                              aria-label="Remove"
                            >
                              <X size={12} />
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                    {/* Body */}
                    {view === 'raw' && hasRaw ? (
                      <pre className="mcp-message-body">
                        {JSON.stringify(msg.rawJson, null, 2)}
                      </pre>
                    ) : isResult && !msg.isStreaming && isHtmlContent(msg.content) ? (
                      <iframe
                        className="mcp-message-iframe"
                        srcDoc={msg.content}
                        sandbox="allow-scripts allow-same-origin"
                        title="Resource preview"
                      />
                    ) : parsedJson !== null ? (
                      <div className={`mcp-message-body json-body ${isResult && !isExpanded ? 'mcp-message-clamped' : ''}`}>
                        <JsonNode value={parsedJson} />
                      </div>
                    ) : (
                      <pre
                        className={`mcp-message-body ${isResult && !isExpanded ? 'mcp-message-clamped' : ''}`}
                      >
                        {msg.isStreaming ? (
                          <span className="thinking">
                            <span className="thinking-dots" aria-hidden="true">
                              <span />
                              <span />
                              <span />
                            </span>
                            Waiting for result…
                          </span>
                        ) : (
                          msg.content || 'No content'
                        )}
                      </pre>
                    )}
                    {msg.createdAt ? (
                      <div className="mcp-message-time">
                        <Clock size={10} />
                        {new Date(msg.createdAt).toLocaleTimeString()}
                      </div>
                    ) : null}
                    {isResult && msg.content && !msg.isStreaming ? (
                      <div className="mcp-token-count">
                        ~{estimateTokens(msg.content)} tokens in context
                      </div>
                    ) : null}
                  </article>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* ── Tool modal ── */}
      {selectedTool ? (
        <div
          className="mcp-modal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedTool(null) }}
          role="dialog"
          aria-modal="true"
          aria-label={`Tool: ${selectedTool.name}`}
        >
          <div className="mcp-modal">
            <ToolForm
              tool={selectedTool}
              loading={callingTool}
              onCall={(args) => handleCallTool(selectedTool.name, args)}
              onClose={() => { setSelectedTool(null); setSelectedToolArgs({}) }}
              initialArgs={selectedToolArgs}
            />
          </div>
        </div>
      ) : null}

      {/* ── Token info modal ── */}
      {tokenInfoTool ? (() => {
        const nameTokens = estimateTokens(tokenInfoTool.name)
        const descTokens = estimateTokens(tokenInfoTool.description ?? '')
        const totalTokens = nameTokens + descTokens
        return (
          <div
            className="modal-backdrop"
            role="presentation"
            onMouseDown={() => setTokenInfoTool(null)}
          >
            <div
              className="modal mcp-token-info-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Token usage breakdown"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="modal-heading">
                <div>
                  <h2>Token usage</h2>
                  <p className="mcp-tool-form-desc">{tokenInfoTool.name}</p>
                </div>
                <button
                  className="icon-button subtle"
                  type="button"
                  onClick={() => setTokenInfoTool(null)}
                  aria-label="Close"
                >
                  <X size={15} />
                </button>
              </div>
              <div className="mcp-token-info-body">
                <div className="mcp-token-info-row">
                  <span>Name</span>
                  <span>~{nameTokens} tokens</span>
                </div>
                {tokenInfoTool.description ? (
                  <div className="mcp-token-info-row">
                    <span>Description</span>
                    <span>~{descTokens} tokens</span>
                  </div>
                ) : null}
                <div className="mcp-token-info-row mcp-token-info-total">
                  <span>Total in context</span>
                  <span>~{totalTokens} tokens</span>
                </div>
                {tokenInfoTool.description ? (
                  <p className="mcp-token-info-note">
                    Estimates are based on ~4 characters per token. Actual counts vary by model tokenizer.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        )
      })() : null}
    </section>
  )
}
