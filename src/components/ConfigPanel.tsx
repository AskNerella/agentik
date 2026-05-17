import {
  Bot,
  Check,
  ChevronDown,
  Copy,
  Database,
  LineChart,
  MoreVertical,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  PlusCircle,
  Server,
  Trash2,
  Upload,
  Download,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { A2AServer, AuthMode, ChatSession, HeaderPair } from '../types/a2a'

type Props = {
  endpoint: string
  authMode: AuthMode
  authToken: string
  oauthToken: string
  headers: HeaderPair[]
  sessions: ChatSession[]
  servers: A2AServer[]
  serverStatus: Record<string, 'checking' | 'online' | 'offline' | 'unknown'>
  activeSessionId: string
  onSaveServer: (server: Omit<A2AServer, 'id' | 'createdAt'>) => void
  onUpdateServer: (id: string, server: Omit<A2AServer, 'id' | 'createdAt'>) => void
  onDeleteServer: (id: string) => void
  onSelectServer: (server: A2AServer) => void
  onNewSession: () => void
  onNewMcpSession: () => void
  onSelectSession: (id: string) => void
  onDeleteSession: (id: string) => void
  onDeleteAllSessions: () => void
  onRenameSession: (id: string, title: string) => void
  onExportData: () => void
  onImportData: (file: File) => void
  onResetAllData: () => void
  activePage: 'playground' | 'monitoring'
  onOpenMonitoring: () => void
  collapsed: boolean
  onToggleCollapsed: () => void
}

type SidebarTab = 'chats' | 'servers' | 'monitoring'

export function ConfigPanel({
  endpoint,
  authMode,
  authToken,
  oauthToken,
  headers,
  sessions,
  servers,
  serverStatus,
  activeSessionId,
  onSaveServer,
  onUpdateServer,
  onDeleteServer,
  onSelectServer,
  onNewSession,
  onNewMcpSession,
  onSelectSession,
  onDeleteSession,
  onDeleteAllSessions,
  onRenameSession,
  onExportData,
  onImportData,
  onResetAllData,
  activePage,
  onOpenMonitoring,
  collapsed,
  onToggleCollapsed,
}: Props) {
  const [activeTab, setActiveTab] = useState<SidebarTab>(activePage === 'monitoring' ? 'monitoring' : 'chats')
  const [serverModalOpen, setServerModalOpen] = useState(false)
  const [editingServer, setEditingServer] = useState<A2AServer | null>(null)
  const [renameModalOpen, setRenameModalOpen] = useState(false)
  const [renamingSession, setRenamingSession] = useState<ChatSession | null>(null)
  const [draftSessionName, setDraftSessionName] = useState('')
  const [draftName, setDraftName] = useState('')
  const [draftEndpoint, setDraftEndpoint] = useState(endpoint)
  const [draftAuthMode, setDraftAuthMode] = useState<AuthMode>(authMode)
  const [draftToken, setDraftToken] = useState(authToken)
  const [draftOauthToken, setDraftOauthToken] = useState(oauthToken)
  const [draftHeaders, setDraftHeaders] = useState<HeaderPair[]>(headers)
  const [draftAuthMenuOpen, setDraftAuthMenuOpen] = useState(false)
  const [sessionTypeModalOpen, setSessionTypeModalOpen] = useState(false)
  const [serverTypePickerOpen, setServerTypePickerOpen] = useState(false)
  const [draftServerKind, setDraftServerKind] = useState<'agent' | 'mcp'>('agent')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [openServerMenuId, setOpenServerMenuId] = useState<string | null>(null)
  const [copiedUrl, setCopiedUrl] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const serverMenuRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!openMenuId) return

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpenMenuId(null)
      }
    }

    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [openMenuId])

  useEffect(() => {
    if (!openServerMenuId) return

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!serverMenuRef.current?.contains(event.target as Node)) {
        setOpenServerMenuId(null)
      }
    }

    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [openServerMenuId])

  const submitServer = (event: FormEvent) => {
    event.preventDefault()
    if (!draftEndpoint.trim()) return
    const fallbackName = (() => {
      try {
        return new URL(draftEndpoint).host
      } catch {
        return draftServerKind === 'mcp' ? 'MCP Server' : 'A2A Server'
      }
    })()
    const nextServer = {
      name: draftName.trim() || fallbackName,
      endpoint: draftEndpoint.trim(),
      serverKind: draftServerKind,
      authMode: draftAuthMode,
      authToken: draftToken.trim(),
      oauthToken: draftOauthToken.trim(),
      headers: draftHeaders.filter((header) => header.key.trim() && header.value.trim()),
    }
    if (editingServer) {
      onUpdateServer(editingServer.id, nextServer)
    } else {
      onSaveServer(nextServer)
    }
    setEditingServer(null)
    setDraftAuthMenuOpen(false)
    setServerModalOpen(false)
  }

  const openServerModal = (server?: A2AServer, kind?: 'agent' | 'mcp') => {
    setEditingServer(server ?? null)
    setDraftServerKind(server?.serverKind ?? kind ?? 'agent')
    setDraftName(server?.name ?? '')
    setDraftEndpoint(server?.endpoint ?? endpoint)
    setDraftAuthMode(server?.authMode ?? (server?.oauthToken ? 'oauth2' : server?.authToken ? 'bearer' : authMode))
    setDraftToken(server?.authToken ?? authToken)
    setDraftOauthToken(server?.oauthToken ?? oauthToken)
    setDraftHeaders(server?.headers ?? headers)
    setDraftAuthMenuOpen(false)
    setServerModalOpen(true)
  }

  const addDraftHeader = () => {
    setDraftHeaders((current) => [...current, { id: crypto.randomUUID(), key: '', value: '' }])
  }

  const updateDraftHeader = (id: string, field: 'key' | 'value', value: string) => {
    setDraftHeaders((current) => current.map((header) => (header.id === id ? { ...header, [field]: value } : header)))
  }

  const removeDraftHeader = (id: string) => {
    setDraftHeaders((current) => current.filter((header) => header.id !== id))
  }

  const openRenameModal = (session: ChatSession) => {
    setRenamingSession(session)
    setDraftSessionName(session.title)
    setRenameModalOpen(true)
    setOpenMenuId(null)
  }

  const submitRename = (event: FormEvent) => {
    event.preventDefault()
    if (!renamingSession) return
    onRenameSession(renamingSession.id, draftSessionName)
    setRenameModalOpen(false)
  }

  const authLabels: Record<AuthMode, string> = {
    none: 'No auth',
    bearer: 'Bearer token',
    oauth2: 'OAuth 2.0 access token',
  }

  const exportSession = (session: ChatSession) => {
    const safeTitle = session.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'session'
    const url = URL.createObjectURL(new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `agentik-${safeTitle}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setOpenMenuId(null)
  }

  if (collapsed) {
    return (
      <aside className="config-panel config-collapsed side-panel">
        <button className="icon-button" type="button" onClick={onToggleCollapsed} aria-label="Open sidebar">
          <PanelLeftOpen size={17} />
        </button>
        <div className="rail-mark">Agentik</div>
      </aside>
    )
  }

  return (
    <aside className="config-panel side-panel">
      <div className="brand">
        <div>
          <h1 className='brand-title'>Agentik</h1>
        </div>
        <button className="icon-button" type="button" onClick={onToggleCollapsed} aria-label="Collapse sidebar">
          <PanelLeftClose size={17} />
        </button>
      </div>

      <div className="sidebar-actions">
        <button type="button" onClick={onExportData}>
          <Download size={14} />
          Export
        </button>
        <button type="button" onClick={() => fileInputRef.current?.click()}>
          <Upload size={14} />
          Import
        </button>
        <button className="danger" type="button" onClick={onResetAllData}>
          <Trash2 size={14} />
          Reset all
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) onImportData(file)
            event.currentTarget.value = ''
          }}
        />
      </div>

      <div className="sidebar-tabs sidebar-tabs-three" role="tablist" aria-label="Agentik sidebar">
        <button className={activeTab === 'chats' ? 'active' : ''} type="button" onClick={() => setActiveTab('chats')}>
          Chats
        </button>
        <button className={activeTab === 'servers' ? 'active' : ''} type="button" onClick={() => setActiveTab('servers')}>
          Servers
        </button>
        <button
          className={activeTab === 'monitoring' ? 'active' : ''}
          type="button"
          onClick={() => {
            setActiveTab('monitoring')
            onOpenMonitoring()
          }}
        >
          Monitor
        </button>
      </div>

      {activeTab === 'chats' ? (
        <div className="sidebar-content chats-content">
          <div className="list-toolbar">
            <button
              className="new-task-button"
              type="button"
              onClick={() => {
                setActiveTab('chats')
                setSessionTypeModalOpen(true)
              }}
            >
              <PlusCircle size={16} />
              New session
            </button>
            {sessions.length > 0 ? (
              <button className="icon-button subtle danger no-tooltip" type="button" onClick={onDeleteAllSessions} aria-label="Delete all chats">
                <Trash2 size={15} />
              </button>
            ) : null}
          </div>
          <div className="chat-session-list">
            {sessions.length === 0 ? (
              <div className="sidebar-empty">
                <p>No chats yet. Create a session when you are ready to prompt.</p>
              </div>
            ) : (
              sessions.map((session) => (
                <div
                  className={`chat-session ${session.id === activeSessionId ? 'active' : ''} ${session.sessionKind === 'mcp' ? 'chat-session-mcp' : ''}`}
                  key={session.id}
                >
                  <button
                    className="chat-session-main"
                    type="button"
                    onClick={() => {
                      setActiveTab('chats')
                      onSelectSession(session.id)
                    }}
                  >
                    <div className="session-card-inner">
                      <div className={`session-card-icon ${session.sessionKind === 'mcp' ? 'session-card-icon--mcp' : 'session-card-icon--agent'}`}>
                        {session.sessionKind === 'mcp' ? <Database size={15} /> : <Bot size={15} />}
                      </div>
                      <div className="session-card-body">
                        <strong>{session.title}</strong>
                        <span>{session.sessionKind === 'mcp' ? 'MCP' : 'A2A'} · {session.messages.length} {session.messages.length === 1 ? 'entry' : 'entries'}</span>
                      </div>
                    </div>
                  </button>
                  <div className="session-actions" ref={openMenuId === session.id ? menuRef : null}>
                    <button
                      className="session-more-button"
                      type="button"
                      onClick={() => setOpenMenuId(openMenuId === session.id ? null : session.id)}
                      aria-label="More session options"
                    >
                      <MoreVertical size={16} />
                    </button>
                    {openMenuId === session.id ? (
                      <div className="session-menu">
                        <button type="button" onClick={() => exportSession(session)}>
                          <Download size={14} />
                          Export
                        </button>
                        <button type="button" onClick={() => openRenameModal(session)}>
                          <Pencil size={14} />
                          Rename
                        </button>
                        <button
                          className="danger"
                          type="button"
                          onClick={() => {
                            onDeleteSession(session.id)
                            setOpenMenuId(null)
                          }}
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : activeTab === 'monitoring' ? (
        <div className="sidebar-content">
          <button className="new-task-button" type="button" onClick={onOpenMonitoring}>
            <LineChart size={18} />
            Open monitoring
          </button>
          <div className="sidebar-empty">
            <p>Search traces and inspect request history from the monitoring page.</p>
          </div>
        </div>
      ) : (
        <div className="sidebar-content servers-content">
          <button
            className="new-task-button"
            type="button"
            onClick={() => setServerTypePickerOpen(true)}
          >
            <PlusCircle size={16} />
            New server
          </button>
          <div className="server-list">
            {servers.length === 0 ? (
              <div className="sidebar-empty">
                <Server size={22} />
                <p>Saved servers will appear here.</p>
              </div>
            ) : (
              servers.map((server) => (
                <div className="server-item" key={server.id}>
                  <button className="server-select-button" type="button" onClick={() => {
                    onSelectServer(server)
                  }}>
                    <div>
                      <strong>
                        <span className={`status-dot status-${serverStatus[server.id] ?? 'unknown'}`} aria-hidden="true" />
                        {server.serverKind === 'mcp' ? (
                          <span className="session-kind-badge session-kind-badge--icon" aria-label="MCP">
                            <Database size={10} />
                          </span>
                        ) : null}
                        {server.name}
                      </strong>
                      <span>
                        {serverStatus[server.id] === 'online'
                          ? 'Available'
                          : serverStatus[server.id] === 'checking'
                            ? 'Checking availability...'
                            : serverStatus[server.id] === 'offline'
                              ? 'Unavailable'
                              : 'Status unknown'}
                      </span>
                    </div>
                    {server.endpoint === endpoint ? <Check size={15} /> : null}
                  </button>
                  <div className="session-actions" ref={openServerMenuId === server.id ? serverMenuRef : null}>
                    <button
                      className="session-more-button server-more-button"
                      type="button"
                      onClick={() => setOpenServerMenuId(openServerMenuId === server.id ? null : server.id)}
                      aria-label={`More options for ${server.name}`}
                    >
                      <MoreVertical size={16} />
                    </button>
                    {openServerMenuId === server.id ? (
                      <div className="session-menu">
                        <button
                          type="button"
                          onClick={() => {
                            openServerModal(server)
                            setOpenServerMenuId(null)
                          }}
                        >
                          <Pencil size={14} />
                          Edit
                        </button>
                        <button
                          className="danger"
                          type="button"
                          onClick={() => {
                            onDeleteServer(server.id)
                            setOpenServerMenuId(null)
                          }}
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {sessionTypeModalOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setSessionTypeModalOpen(false)}
        >
          <div
            className="modal session-type-modal"
            role="dialog"
            aria-modal="true"
            aria-label="New session type"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <h2>New session</h2>
              <button
                className="icon-button subtle"
                type="button"
                onClick={() => setSessionTypeModalOpen(false)}
                aria-label="Close"
              >
                <X size={15} />
              </button>
            </div>
            <p className="session-type-subtitle">What do you want to connect to?</p>
            <div className="session-type-cards">
              <button
                className="session-type-card"
                type="button"
                onClick={() => {
                  setSessionTypeModalOpen(false)
                  onNewSession()
                }}
              >
                <div className="session-type-card-icon">
                  <Bot size={24} />
                </div>
                <strong>Agent (A2A)</strong>
                <span>Connect to an AI agent using the Agent-to-Agent protocol. Supports streaming, artifacts, and multi-turn conversations.</span>
              </button>
              <button
                className="session-type-card"
                type="button"
                onClick={() => {
                  setSessionTypeModalOpen(false)
                  onNewMcpSession()
                }}
              >
                <div className="session-type-card-icon">
                  <Database size={24} />
                </div>
                <strong>MCP Server</strong>
                <span>Connect to a Model Context Protocol server. Browse tools, resources, and prompts — call tools directly with auto-generated forms.</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {serverTypePickerOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setServerTypePickerOpen(false)}
        >
          <div
            className="modal session-type-modal"
            role="dialog"
            aria-modal="true"
            aria-label="New server type"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <h2>New server</h2>
              <button
                className="icon-button subtle"
                type="button"
                onClick={() => setServerTypePickerOpen(false)}
                aria-label="Close"
              >
                <X size={15} />
              </button>
            </div>
            <p className="session-type-subtitle">What kind of server are you adding?</p>
            <div className="session-type-cards">
              <button
                className="session-type-card"
                type="button"
                onClick={() => {
                  setServerTypePickerOpen(false)
                  openServerModal(undefined, 'agent')
                }}
              >
                <div className="session-type-card-icon">
                  <Bot size={24} />
                </div>
                <strong>Agent (A2A)</strong>
                <span>Save an AI agent endpoint. Use the Agent Card URL to connect and start chatting.</span>
              </button>
              <button
                className="session-type-card"
                type="button"
                onClick={() => {
                  setServerTypePickerOpen(false)
                  openServerModal(undefined, 'mcp')
                }}
              >
                <div className="session-type-card-icon">
                  <Database size={24} />
                </div>
                <strong>MCP Server</strong>
                <span>Save a Model Context Protocol server. Browse and call tools, resources, and prompts.</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {renameModalOpen && renamingSession ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setRenameModalOpen(false)}>
          <form className="modal" onSubmit={submitRename} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <h2>Rename session</h2>
              <button className="icon-button subtle" type="button" onClick={() => setRenameModalOpen(false)} aria-label="Close rename modal">
                <X size={15} />
              </button>
            </div>
            <label>
              Session name
              <input value={draftSessionName} onChange={(event) => setDraftSessionName(event.target.value)} placeholder="Session name" />
            </label>
            <button className="primary-button" type="submit" disabled={!draftSessionName.trim()}>
              Save name
            </button>
          </form>
        </div>
      ) : null}

      {serverModalOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => {
            setEditingServer(null)
            setDraftAuthMenuOpen(false)
            setServerModalOpen(false)
          }}
        >
          <form className="modal" onSubmit={submitServer} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <h2>{editingServer
                  ? `Edit ${draftServerKind === 'mcp' ? 'MCP' : 'A2A'} server`
                  : `Add ${draftServerKind === 'mcp' ? 'MCP' : 'A2A'} server`}</h2>
              <button
                className="icon-button subtle"
                type="button"
                onClick={() => {
                  setEditingServer(null)
                  setDraftAuthMenuOpen(false)
                  setServerModalOpen(false)
                }}
                aria-label="Close server modal"
              >
                <X size={15} />
              </button>
            </div>
            <label>
              Name
              <input value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder="Research Agent" />
            </label>
            <label>
              {draftServerKind === 'mcp' ? 'Server URL' : 'Agent Card URL'}
              <div className="url-input-row">
                <input
                  type="url"
                  value={draftEndpoint}
                  onChange={(event) => setDraftEndpoint(event.target.value)}
                  placeholder={draftServerKind === 'mcp'
                    ? 'https://mcp.example.com/mcp'
                    : 'https://agent.example.com/.well-known/agent-card.json'}
                />
                <button
                  className="icon-button subtle no-tooltip"
                  type="button"
                  title={copiedUrl ? 'Copied!' : 'Copy URL'}
                  aria-label="Copy URL"
                  onClick={() => {
                    if (!draftEndpoint.trim()) return
                    navigator.clipboard.writeText(draftEndpoint.trim()).then(() => {
                      setCopiedUrl(true)
                      setTimeout(() => setCopiedUrl(false), 1800)
                    })
                  }}
                >
                  {copiedUrl ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </label>
            <label>
              Auth type
              <div className="auth-select">
                <button type="button" onClick={() => setDraftAuthMenuOpen((open) => !open)} aria-expanded={draftAuthMenuOpen}>
                  {authLabels[draftAuthMode]}
                  <ChevronDown size={15} className={draftAuthMenuOpen ? 'rotated' : ''} />
                </button>
                {draftAuthMenuOpen ? (
                  <div className="auth-menu">
                    {(['none', 'bearer', 'oauth2'] as AuthMode[]).map((mode) => (
                      <button
                        className={draftAuthMode === mode ? 'active' : ''}
                        type="button"
                        key={mode}
                        onClick={() => {
                          setDraftAuthMode(mode)
                          setDraftAuthMenuOpen(false)
                        }}
                      >
                        {authLabels[mode]}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </label>
            {draftAuthMode === 'bearer' ? (
              <label>
                Bearer token
                <input
                  type="password"
                  value={draftToken}
                  onChange={(event) => setDraftToken(event.target.value)}
                  placeholder="Optional"
                  autoComplete="off"
                />
              </label>
            ) : null}
            {draftAuthMode === 'oauth2' ? (
              <label>
                OAuth 2.0 access token
                <input
                  type="password"
                  value={draftOauthToken}
                  onChange={(event) => setDraftOauthToken(event.target.value)}
                  placeholder="Access token"
                  autoComplete="off"
                />
              </label>
            ) : null}
            <div className="input-label">Custom headers</div>
            <div className="header-editor">
              {draftHeaders.map((header) => (
                <div className="header-row" key={header.id}>
                  <input
                    value={header.key}
                    onChange={(event) => updateDraftHeader(header.id, 'key', event.target.value)}
                    placeholder="Header"
                    aria-label="Header name"
                  />
                  <input
                    value={header.value}
                    onChange={(event) => updateDraftHeader(header.id, 'value', event.target.value)}
                    placeholder="Value"
                    aria-label="Header value"
                  />
                  <button className="icon-button subtle" type="button" onClick={() => removeDraftHeader(header.id)} aria-label="Remove header">
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button className="secondary-button compact-button" type="button" onClick={addDraftHeader}>
                <PlusCircle size={14} />
                Add header
              </button>
            </div>
            <button className="primary-button" type="submit" disabled={!draftEndpoint.trim()}>
              {editingServer ? 'Update server' : 'Save server'}
            </button>
          </form>
        </div>
      ) : null}
    </aside>
  )
}
