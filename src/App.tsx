import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { ChatWindow } from './components/ChatWindow'
import { ConfigPanel } from './components/ConfigPanel'
import { InspectorPanel } from './components/InspectorPanel'
import { MonitoringPage } from './components/MonitoringPage'
import { useAgent } from './hooks/useAgent'
import { useChat } from './hooks/useChat'
import { useTrace } from './hooks/useTrace'
import type { A2AServer, ChatSession, HeaderPair, PlaygroundExport, TraceLog } from './types/a2a'
import { validateAgentCard } from './utils/agentCardValidation'

const STORAGE_KEY = 'agentik.a2a-playground.v1'
type AppPage = 'playground' | 'monitoring'
type ConnectionStatus = 'checking' | 'online' | 'offline' | 'unknown'

function loadStoredData(): Partial<PlaygroundExport> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

function buildHeaderMap(headers: HeaderPair[], authToken: string) {
  const headerMap = headers.reduce<Record<string, string>>((acc, header) => {
    const key = header.key.trim()
    const value = header.value.trim()
    if (key && value) acc[key] = value
    return acc
  }, {})

  if (authToken.trim()) {
    headerMap.Authorization = `Bearer ${authToken.trim()}`
  }

  return headerMap
}

function App() {
  const storedData = useMemo(() => loadStoredData(), [])
  const [endpoint, setEndpoint] = useState('')
  const [endpointProvided, setEndpointProvided] = useState(false)
  const [authToken, setAuthToken] = useState('')
  const [streaming, setStreaming] = useState(true)
  const [notification, setNotification] = useState<string | null>(null)
  const [configCollapsed, setConfigCollapsed] = useState(false)
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false)
  const [inspectorExpanded, setInspectorExpanded] = useState(false)
  const [activePage, setActivePage] = useState<AppPage>('playground')
  const [selectedTraceMessageId, setSelectedTraceMessageId] = useState<string | null>(null)
  const [activeSessionId, setActiveSessionId] = useState<string>(storedData.sessions?.[0]?.id ?? '')
  const [activeContextId, setActiveContextId] = useState<string>(storedData.sessions?.[0]?.contextId ?? crypto.randomUUID())
  const [sessions, setSessions] = useState<ChatSession[]>(storedData.sessions ?? [])
  const [servers, setServers] = useState<A2AServer[]>(storedData.servers ?? [])
  const [headers, setHeaders] = useState<HeaderPair[]>([])
  const [serverStatus, setServerStatus] = useState<Record<string, ConnectionStatus>>({})

  const { logs, appendTrace, clearLogs, setLogs } = useTrace(storedData.traces ?? [])
  const { card, setCard, clearAgentCard, validation, loading: agentLoading, error: agentError, loadAgentCard } = useAgent(appendTrace)
  const {
    messages,
    setMessages,
    loading: chatLoading,
    error: chatError,
    sendChatMessage,
  } = useChat(appendTrace, storedData.sessions?.[0]?.messages ?? [])

  const requestHeaders = useMemo(() => buildHeaderMap(headers, authToken), [headers, authToken])
  const activeMessageEndpoint = card?.url || card?.endpoint || endpoint
  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? sessions[0],
    [activeSessionId, sessions],
  )
  const activeSessionLogs = useMemo(
    () =>
      logs.filter((log) => {
        if (log.kind === 'agent-card') return Boolean(endpoint && log.request && JSON.stringify(log.request).includes(endpoint))
        return log.contextId === activeContextId
      }),
    [activeContextId, endpoint, logs],
  )
  const inspectorLogs = useMemo(
    () =>
      selectedTraceMessageId
        ? activeSessionLogs.filter((log) => log.messageId === selectedTraceMessageId)
        : activeSessionLogs,
    [activeSessionLogs, selectedTraceMessageId],
  )
  const activeServerId = useMemo(
    () => servers.find((server) => server.endpoint === endpoint)?.id,
    [endpoint, servers],
  )
  const activeConnectionStatus = activeServerId ? serverStatus[activeServerId] ?? 'unknown' : endpointProvided ? 'online' : 'unknown'

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const exportData: PlaygroundExport = {
        version: 1,
        exportedAt: new Date().toISOString(),
        sessions,
        servers,
        traces: logs,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(exportData))
    }, 150)

    return () => window.clearTimeout(timer)
  }, [logs, servers, sessions])

  useEffect(() => {
    if (!activeSessionId) return
    const timer = window.setTimeout(() => {
      setSessions((current) =>
        current.map((session) =>
          session.id === activeSessionId
            ? {
                ...session,
                title: session.renamed ? session.title : messages[0]?.content.slice(0, 42) || 'New agent session',
                subtitle:
                  messages.length === 0
                    ? 'No messages yet'
                    : `${messages.length} message${messages.length === 1 ? '' : 's'}`,
                messages,
                endpoint,
                contextId: activeContextId,
                connected: endpointProvided,
                agentCard: card,
                updatedAt: new Date().toISOString(),
              }
            : session,
        ),
      )
    }, 0)

    return () => window.clearTimeout(timer)
  }, [activeContextId, activeSessionId, card, endpoint, endpointProvided, messages])

  useEffect(() => {
    if (servers.length === 0) return

    let cancelled = false
    const checkServer = async (server: A2AServer) => {
      setServerStatus((current) => ({ ...current, [server.id]: 'checking' }))
      try {
        const response = await fetch(server.endpoint, {
          method: 'GET',
          headers: buildHeaderMap(server.headers, server.authToken),
        })
        if (!cancelled) {
          setServerStatus((current) => ({ ...current, [server.id]: response.ok ? 'online' : 'offline' }))
        }
      } catch {
        if (!cancelled) {
          setServerStatus((current) => ({ ...current, [server.id]: 'offline' }))
        }
      }
    }

    const runChecks = () => {
      servers.forEach((server) => {
        void checkServer(server)
      })
    }

    runChecks()
    const interval = window.setInterval(runChecks, 15000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [servers])

  useEffect(() => {
    if (!notification) return undefined

    const timer = window.setTimeout(() => setNotification(null), 2000)
    return () => window.clearTimeout(timer)
  }, [notification])

  const handleFetchAgentCard = async () => {
    if (!endpoint.trim()) return
    setNotification(null)
    const nextCard = await loadAgentCard(endpoint.trim(), requestHeaders)
    if (nextCard && validateAgentCard(nextCard).valid) {
      setEndpointProvided(true)
      setSelectedTraceMessageId(null)
      return
    }

    setEndpointProvided(false)
    setNotification(
      nextCard
        ? 'Unable to connect. Agent card is invalid for A2A 0.3.0. Check that it includes name, url, and skills.'
        : 'Unable to connect. If this is a CORS issue, the agent card server must allow browser requests. Try a different agent card.',
    )
  }

  const handleEndpointChange = (value: string) => {
    setEndpoint(value)
    setEndpointProvided(false)
    clearAgentCard()
    setNotification(null)
  }

  const createSession = ({ keepConnection = false }: { keepConnection?: boolean } = {}) => {
    const id = crypto.randomUUID()
    const contextId = crypto.randomUUID()
    const nextSession: ChatSession = {
      id,
      title: 'New agent session',
      subtitle: 'No messages yet',
      messages: [],
      endpoint: keepConnection ? endpoint : '',
      contextId,
      connected: keepConnection ? endpointProvided : false,
      agentCard: keepConnection ? card ?? null : null,
      updatedAt: new Date().toISOString(),
    }
    setSessions((current) => [
      nextSession,
      ...current,
    ])
    setActiveSessionId(id)
    setActiveContextId(contextId)
    setActivePage('playground')
    setMessages([])
    if (!keepConnection) {
      setEndpoint('')
      setEndpointProvided(false)
      clearAgentCard()
    }
    setSelectedTraceMessageId(null)
    return { id, contextId }
  }

  const handleNewSession = () => {
    createSession({ keepConnection: false })
  }

  const handleSelectSession = (id: string) => {
    const nextSession = sessions.find((session) => session.id === id)
    if (!nextSession) return
    setActiveSessionId(id)
    setActiveContextId(nextSession.contextId)
    setActivePage('playground')
    setMessages(nextSession.messages)
    setEndpoint(nextSession.endpoint)
    setEndpointProvided(nextSession.connected)
    setCard(nextSession.agentCard ?? null)
    setSelectedTraceMessageId(null)
    if (nextSession.connected && nextSession.endpoint && !nextSession.agentCard) void loadAgentCard(nextSession.endpoint, requestHeaders)
  }

  const handleDeleteSession = (id: string) => {
    const remaining = sessions.filter((session) => session.id !== id)
    const nextSessions = remaining
    setSessions(nextSessions)
    if (id === activeSessionId) {
      const nextSession = nextSessions[0]
      if (nextSession) {
        setActiveSessionId(nextSession.id)
        setActiveContextId(nextSession.contextId)
        setMessages(nextSession.messages)
        setEndpoint(nextSession.endpoint)
        setEndpointProvided(nextSession.connected)
        setCard(nextSession.agentCard ?? null)
      } else {
        setActiveSessionId('')
        setActiveContextId(crypto.randomUUID())
        setMessages([])
        setEndpoint('')
        setEndpointProvided(false)
        clearAgentCard()
      }
      setSelectedTraceMessageId(null)
    }
  }

  const handleDeleteAllSessions = () => {
    setSessions([])
    setActiveSessionId('')
    setActiveContextId(crypto.randomUUID())
    setMessages([])
    setSelectedTraceMessageId(null)
    setNotification('All chats deleted.')
  }

  const handleRenameSession = (id: string, title: string) => {
    const nextTitle = title.trim()
    if (!nextTitle) return

    setSessions((current) =>
      current.map((session) =>
        session.id === id
          ? {
              ...session,
              title: nextTitle,
              renamed: true,
              updatedAt: new Date().toISOString(),
            }
          : session,
      ),
    )
  }

  const handleClearTraces = () => {
    clearLogs()
    setNotification('Traces cleared.')
  }

  const handleSaveServer = (server: Omit<A2AServer, 'id' | 'createdAt'>) => {
    const nextServer = {
      ...server,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }
    setServers((current) => [nextServer, ...current])
    setEndpoint(nextServer.endpoint)
    setAuthToken(nextServer.authToken)
    setHeaders(nextServer.headers)
    setEndpointProvided(false)
  }

  const handleUpdateServer = (id: string, server: Omit<A2AServer, 'id' | 'createdAt'>) => {
    const previous = servers.find((item) => item.id === id)
    const changed =
      previous &&
      (previous.name !== server.name ||
        previous.endpoint !== server.endpoint ||
        previous.authToken !== server.authToken ||
        JSON.stringify(previous.headers) !== JSON.stringify(server.headers))
    setServers((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              ...server,
            }
          : item,
      ),
    )

    if (previous?.endpoint && endpoint === previous.endpoint) {
      setEndpoint(server.endpoint)
      setAuthToken(server.authToken)
      setHeaders(server.headers)
    }

    if (previous?.endpoint && changed) {
      const disconnected = sessions.filter((session) => session.endpoint === previous.endpoint && session.connected).length
      setSessions((current) =>
        current.map((session) => {
          if (session.endpoint !== previous.endpoint || !session.connected) return session
          return { ...session, connected: false, agentCard: null, updatedAt: new Date().toISOString() }
        }),
      )
      if (endpoint === previous.endpoint) {
        setEndpointProvided(false)
        clearAgentCard()
      }
      if (disconnected > 0) setNotification('Disconnected sessions using the updated server.')
    }
  }

  const handleDeleteServer = (id: string) => {
    const server = servers.find((item) => item.id === id)
    setServers((current) => current.filter((item) => item.id !== id))
    if (server?.endpoint && endpoint === server.endpoint) {
      setEndpoint('')
      setEndpointProvided(false)
      clearAgentCard()
    }
    setServerStatus((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
  }

  const handleSelectServer = (server: A2AServer) => {
    setEndpoint(server.endpoint)
    setAuthToken(server.authToken)
    setHeaders(server.headers)
    setEndpointProvided(false)
    clearAgentCard()
    setNotification(null)
  }

  const handleSendMessage = (message: string) => {
    if (!activeMessageEndpoint.trim()) return
    const contextId = activeSessionId ? activeContextId : createSession({ keepConnection: true }).contextId
    sendChatMessage(activeMessageEndpoint.trim(), message, streaming, contextId, requestHeaders)
  }

  const handleClearAndStartNewSession = () => {
    if (!activeSessionId) return
    const previousSessionId = activeSessionId
    createSession({ keepConnection: true })
    setSessions((current) => current.filter((session) => session.id !== previousSessionId))
    setNotification('Started a new session.')
  }

  const handleReplayTrace = (trace: TraceLog) => {
    if (trace.kind !== 'request') return
    const replayText = trace.displayText?.trim()
    if (!replayText || !activeMessageEndpoint.trim()) return
    sendChatMessage(activeMessageEndpoint.trim(), replayText, streaming, activeContextId, requestHeaders)
  }

  const handleExportData = () => {
    const exportData: PlaygroundExport = {
      version: 1,
      exportedAt: new Date().toISOString(),
      sessions,
      servers,
      traces: logs,
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `agentik-a2a-playground-${new Date().toISOString()}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const handleImportData = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as Partial<PlaygroundExport>
      if (parsed.sessions?.length) {
        setSessions(parsed.sessions)
        const firstSession = parsed.sessions[0]
        setActiveSessionId(firstSession.id)
        setActiveContextId(firstSession.contextId)
        setMessages(firstSession.messages)
        setEndpoint(firstSession.endpoint)
        setEndpointProvided(firstSession.connected)
      }
      if (parsed.servers) setServers(parsed.servers)
      if (parsed.traces) setLogs(parsed.traces)
      setNotification('Imported playground data.')
    } catch {
      setNotification('Unable to import playground data. Choose a valid export JSON file.')
    }
  }

  return (
    <main
      className={`app-shell ${configCollapsed ? 'config-is-collapsed' : ''} ${inspectorCollapsed ? 'inspector-is-collapsed' : ''} ${inspectorExpanded ? 'inspector-is-expanded' : ''}`}
    >
      <ConfigPanel
        endpoint={endpoint}
        authToken={authToken}
        headers={headers}
        sessions={sessions}
        servers={servers}
        serverStatus={serverStatus}
        activeSessionId={activeSessionId}
        onSaveServer={handleSaveServer}
        onUpdateServer={handleUpdateServer}
        onDeleteServer={handleDeleteServer}
        onSelectServer={handleSelectServer}
        onNewSession={handleNewSession}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        onDeleteAllSessions={handleDeleteAllSessions}
        onRenameSession={handleRenameSession}
        onExportData={handleExportData}
        onImportData={handleImportData}
        activePage={activePage}
        onOpenMonitoring={() => setActivePage('monitoring')}
        collapsed={configCollapsed}
        onToggleCollapsed={() => setConfigCollapsed((collapsed) => !collapsed)}
      />

      <div className="workspace">
        {notification ? (
          <div className="toast" role="status">
            {notification}
          </div>
        ) : null}
        {activePage === 'monitoring' ? (
          <MonitoringPage logs={logs} onClearTraces={handleClearTraces} onReplayTrace={handleReplayTrace} />
        ) : (
          <ChatWindow
            sessionTitle={sessions.find((session) => session.id === activeSessionId)?.title ?? 'New agent session'}
            messages={messages}
            loading={chatLoading}
            error={chatError}
            streaming={streaming}
            disabled={!activeMessageEndpoint.trim()}
            endpoint={endpoint}
            endpointProvided={endpointProvided}
            agentLoading={agentLoading}
            servers={servers}
            onEndpointChange={handleEndpointChange}
            onSelectServer={handleSelectServer}
            onConnect={handleFetchAgentCard}
            onStreamingChange={setStreaming}
            onSend={handleSendMessage}
            onClear={handleClearAndStartNewSession}
            contextId={activeContextId}
            connectionStatus={activeConnectionStatus}
            selectedTraceMessageId={selectedTraceMessageId}
            onSelectMessageTrace={(messageId) => setSelectedTraceMessageId(messageId)}
          />
        )}
      </div>

      <InspectorPanel
        card={card}
        validation={validation}
        agentError={agentError}
        logs={inspectorLogs}
        traceFilterLabel={selectedTraceMessageId ? 'Selected message' : activeSession?.title ?? 'Session'}
        messageCount={messages.length}
        artifacts={messages.flatMap((message) => message.artifacts ?? [])}
        onReplayTrace={handleReplayTrace}
        onClearTraces={handleClearTraces}
        collapsed={inspectorCollapsed}
        onToggleCollapsed={() => {
          setInspectorCollapsed((collapsed) => !collapsed)
          setInspectorExpanded(false)
        }}
        expanded={inspectorExpanded}
        onToggleExpanded={() => {
          setInspectorCollapsed(false)
          setInspectorExpanded((expanded) => !expanded)
        }}
      />
    </main>
  )
}

export default App
