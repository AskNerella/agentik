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
  const initialSessionId = useMemo(() => crypto.randomUUID(), [])
  const initialContextId = useMemo(() => crypto.randomUUID(), [])
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
  const [activeSessionId, setActiveSessionId] = useState<string>(storedData.sessions?.[0]?.id ?? initialSessionId)
  const [activeContextId, setActiveContextId] = useState<string>(storedData.sessions?.[0]?.contextId ?? initialContextId)
  const [sessions, setSessions] = useState<ChatSession[]>(
    storedData.sessions?.length
      ? storedData.sessions
      : [
          {
            id: initialSessionId,
            title: 'New agent session',
            subtitle: 'No messages yet',
            messages: [],
            endpoint: '',
            contextId: initialContextId,
            connected: false,
            updatedAt: new Date().toISOString(),
          },
        ],
  )
  const [servers, setServers] = useState<A2AServer[]>(storedData.servers ?? [])
  const [headers, setHeaders] = useState<HeaderPair[]>([])

  const { logs, appendTrace, clearLogs, setLogs } = useTrace(storedData.traces ?? [])
  const { card, validation, loading: agentLoading, error: agentError, loadAgentCard } = useAgent(appendTrace)
  const {
    messages,
    setMessages,
    loading: chatLoading,
    error: chatError,
    sendChatMessage,
    clearMessages,
  } = useChat(appendTrace, storedData.sessions?.[0]?.messages ?? [])

  const requestHeaders = useMemo(() => buildHeaderMap(headers, authToken), [headers, authToken])
  const activeMessageEndpoint = card?.url || card?.endpoint || endpoint

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
                updatedAt: new Date().toISOString(),
              }
            : session,
        ),
      )
    }, 0)

    return () => window.clearTimeout(timer)
  }, [activeContextId, activeSessionId, endpoint, endpointProvided, messages])

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
    setNotification(null)
  }

  const handleNewSession = () => {
    const id = crypto.randomUUID()
    const contextId = crypto.randomUUID()
    setSessions((current) => [
      {
        id,
        title: 'New agent session',
        subtitle: 'No messages yet',
        messages: [],
        endpoint: '',
        contextId,
        connected: false,
        updatedAt: new Date().toISOString(),
      },
      ...current,
    ])
    setActiveSessionId(id)
    setActiveContextId(contextId)
    setActivePage('playground')
    setMessages([])
    setEndpoint('')
    setEndpointProvided(false)
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
  }

  const handleDeleteSession = (id: string) => {
    const remaining = sessions.filter((session) => session.id !== id)
    const fallbackSession: ChatSession = {
      id: crypto.randomUUID(),
      title: 'New agent session',
      subtitle: 'No messages yet',
      messages: [],
      endpoint: '',
      contextId: crypto.randomUUID(),
      connected: false,
      updatedAt: new Date().toISOString(),
    }
    const nextSessions = remaining.length > 0 ? remaining : [fallbackSession]
    setSessions(nextSessions)
    if (id === activeSessionId) {
      const nextSession = nextSessions[0]
      setActiveSessionId(nextSession.id)
      setActiveContextId(nextSession.contextId)
      setMessages(nextSession.messages)
      setEndpoint(nextSession.endpoint)
      setEndpointProvided(nextSession.connected)
    }
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

  const handleSelectServer = (server: A2AServer) => {
    setEndpoint(server.endpoint)
    setAuthToken(server.authToken)
    setHeaders(server.headers)
    setEndpointProvided(false)
    setNotification(null)
  }

  const handleSendMessage = (message: string) => {
    if (!activeMessageEndpoint.trim()) return
    sendChatMessage(activeMessageEndpoint.trim(), message, streaming, activeContextId, requestHeaders)
  }

  const handleReplayTrace = (trace: TraceLog) => {
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
        activeSessionId={activeSessionId}
        onSaveServer={handleSaveServer}
        onSelectServer={handleSelectServer}
        onNewSession={handleNewSession}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
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
            onClear={clearMessages}
            contextId={activeContextId}
          />
        )}
      </div>

      <InspectorPanel
        card={card}
        validation={validation}
        agentError={agentError}
        logs={logs}
        messageCount={messages.length}
        artifacts={messages.flatMap((message) => message.artifacts ?? [])}
        onReplayTrace={handleReplayTrace}
        onClearTraces={handleClearTraces}
        collapsed={inspectorCollapsed}
        onToggleCollapsed={() => setInspectorCollapsed((collapsed) => !collapsed)}
        expanded={inspectorExpanded}
        onToggleExpanded={() => setInspectorExpanded((expanded) => !expanded)}
      />
    </main>
  )
}

export default App
