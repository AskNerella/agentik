import {
  Check,
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
import type { A2AServer, ChatSession, HeaderPair } from '../types/a2a'

type Props = {
  endpoint: string
  authToken: string
  headers: HeaderPair[]
  sessions: ChatSession[]
  servers: A2AServer[]
  activeSessionId: string
  onSaveServer: (server: Omit<A2AServer, 'id' | 'createdAt'>) => void
  onUpdateServer: (id: string, server: Omit<A2AServer, 'id' | 'createdAt'>) => void
  onDeleteServer: (id: string) => void
  onSelectServer: (server: A2AServer) => void
  onNewSession: () => void
  onSelectSession: (id: string) => void
  onDeleteSession: (id: string) => void
  onRenameSession: (id: string, title: string) => void
  onExportData: () => void
  onImportData: (file: File) => void
  activePage: 'playground' | 'monitoring'
  onOpenMonitoring: () => void
  collapsed: boolean
  onToggleCollapsed: () => void
}

type SidebarTab = 'chats' | 'servers' | 'monitoring'

export function ConfigPanel({
  endpoint,
  authToken,
  headers,
  sessions,
  servers,
  activeSessionId,
  onSaveServer,
  onUpdateServer,
  onDeleteServer,
  onSelectServer,
  onNewSession,
  onSelectSession,
  onDeleteSession,
  onRenameSession,
  onExportData,
  onImportData,
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
  const [draftToken, setDraftToken] = useState(authToken)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
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

  const submitServer = (event: FormEvent) => {
    event.preventDefault()
    if (!draftEndpoint.trim()) return
    const fallbackName = (() => {
      try {
        return new URL(draftEndpoint).host
      } catch {
        return 'A2A Server'
      }
    })()
    const nextServer = {
      name: draftName.trim() || fallbackName,
      endpoint: draftEndpoint.trim(),
      authToken: draftToken.trim(),
      headers,
    }
    if (editingServer) {
      onUpdateServer(editingServer.id, nextServer)
    } else {
      onSaveServer(nextServer)
    }
    setEditingServer(null)
    setServerModalOpen(false)
  }

  const openServerModal = (server?: A2AServer) => {
    setEditingServer(server ?? null)
    setDraftName(server?.name ?? '')
    setDraftEndpoint(server?.endpoint ?? endpoint)
    setDraftToken(server?.authToken ?? authToken)
    setServerModalOpen(true)
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
        <div className="sidebar-content">
          <button
            className="new-task-button"
            type="button"
            onClick={() => {
              setActiveTab('chats')
              onNewSession()
            }}
          >
            <PlusCircle size={16} />
            New session
          </button>
          <div className="chat-session-list">
            {sessions.map((session) => (
              <div
                className={`chat-session ${session.id === activeSessionId ? 'active' : ''}`}
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
                  <div>
                    <strong>{session.title}</strong>
                    <span>{session.subtitle}</span>
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
            ))}
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
        <div className="sidebar-content">
          <button
            className="new-task-button"
            type="button"
            onClick={() => openServerModal()}
          >
            <PlusCircle size={16} />
            New server
          </button>
          <div className="server-list">
            {servers.length === 0 ? (
              <div className="sidebar-empty">
                <Server size={22} />
                <p>Saved A2A servers will appear here.</p>
              </div>
            ) : (
              servers.map((server) => (
                <div className="server-item" key={server.id}>
                  <button className="server-select-button" type="button" onClick={() => onSelectServer(server)}>
                    <div>
                      <strong>{server.name}</strong>
                      <span>{server.endpoint}</span>
                    </div>
                    {server.endpoint === endpoint ? <Check size={15} /> : null}
                  </button>
                  <div className="server-actions">
                    <button className="icon-button subtle" type="button" onClick={() => openServerModal(server)} aria-label={`Edit ${server.name}`}>
                      <Pencil size={14} />
                    </button>
                    <button className="icon-button subtle danger" type="button" onClick={() => onDeleteServer(server.id)} aria-label={`Delete ${server.name}`}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

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
            setServerModalOpen(false)
          }}
        >
          <form className="modal" onSubmit={submitServer} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <h2>{editingServer ? 'Edit A2A server' : 'Add A2A server'}</h2>
              <button
                className="icon-button subtle"
                type="button"
                onClick={() => {
                  setEditingServer(null)
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
              Agent Card URL
              <input
                type="url"
                value={draftEndpoint}
                onChange={(event) => setDraftEndpoint(event.target.value)}
                placeholder="https://agent.example.com/.well-known/agent-card.json"
              />
            </label>
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
            <button className="primary-button" type="submit" disabled={!draftEndpoint.trim()}>
              {editingServer ? 'Update server' : 'Save server'}
            </button>
          </form>
        </div>
      ) : null}
    </aside>
  )
}
