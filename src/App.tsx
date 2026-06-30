import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import { ChatWindow } from './components/ChatWindow'
import { ConfigPanel } from './components/ConfigPanel'
import { InspectorPanel } from './components/InspectorPanel'
import { McpChatWindow } from './components/McpChatWindow'
import { MonitoringPage } from './components/MonitoringPage'
import { useAgent } from './hooks/useAgent'
import { useChat } from './hooks/useChat'
import { useTrace } from './hooks/useTrace'
import { fetchAgentCard } from './services/a2aClient'
import {
  callMcpTool,
  clearMcpSession,
  getMcpPrompt,
  initializeMcp,
  listMcpPrompts,
  listMcpResources,
  listMcpTools,
  readMcpResource,
} from './services/mcpClient'
import type {
  A2AServer,
  AuthMode,
  ChatMessage,
  ChatSession,
  HeaderPair,
  McpPrompt,
  McpResource,
  McpServerInfo,
  McpTool,
  PlaygroundExport,
  TraceLog,
} from './types/a2a'
import { validateAgentCard } from './utils/agentCardValidation'

const STORAGE_KEY = 'agentik.a2a-playground.v1'
type AppPage = 'playground' | 'monitoring'
type ConnectionStatus = 'checking' | 'online' | 'offline' | 'unknown'

function normalizeArtifactText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function loadStoredData(): Partial<PlaygroundExport> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

function resolveAuthMode(authMode: AuthMode | undefined, authToken: string, oauthToken?: string): AuthMode {
  if (authMode) return authMode
  if (oauthToken?.trim()) return 'oauth2'
  if (authToken.trim()) return 'bearer'
  return 'none'
}

function buildHeaderMap(headers: HeaderPair[], authToken: string, authMode: AuthMode = 'bearer', oauthToken = '') {
  const headerMap = headers.reduce<Record<string, string>>((acc, header) => {
    const key = header.key.trim()
    const value = header.value.trim()
    if (key && value) acc[key] = value
    return acc
  }, {})

  if (authMode === 'bearer' && authToken.trim()) {
    headerMap.Authorization = `Bearer ${authToken.trim()}`
  }

  if (authMode === 'oauth2' && oauthToken.trim()) {
    headerMap.Authorization = `Bearer ${oauthToken.trim()}`
  }

  return headerMap
}

function App() {
  const storedData = useMemo(() => loadStoredData(), [])
  const [endpoint, setEndpoint] = useState('')
  const [endpointProvided, setEndpointProvided] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('none')
  const [authToken, setAuthToken] = useState('')
  const [oauthToken, setOauthToken] = useState('')
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
  const [clearedSessionTraceIds, setClearedSessionTraceIds] = useState<Set<string>>(new Set())

  // MCP client state for the active MCP session
  const [mcpServerInfo, setMcpServerInfo] = useState<McpServerInfo | null>(null)
  const [mcpTools, setMcpTools] = useState<McpTool[]>([])
  const [mcpResources, setMcpResources] = useState<McpResource[]>([])
  const [mcpPrompts, setMcpPrompts] = useState<McpPrompt[]>([])
  const [mcpLoading, setMcpLoading] = useState(false)

  const { logs, appendTrace, clearLogs, setLogs } = useTrace(storedData.traces ?? [])
  const { card, setCard, clearAgentCard, validation, loading: agentLoading, error: agentError, loadAgentCard } = useAgent(appendTrace)
  const updateSessionMessages = useCallback((contextId: string, updater: (messages: ChatSession['messages']) => ChatSession['messages']) => {
    setSessions((current) =>
      current.map((session) => {
        if (session.contextId !== contextId) return session
        const messages = updater(session.messages)
        return {
          ...session,
          title: session.renamed || session.sessionKind === 'mcp' ? session.title : messages[0]?.content.slice(0, 42) || 'New agent session',
          subtitle:
            messages.length === 0
              ? 'No messages yet'
              : `${messages.length} message${messages.length === 1 ? '' : 's'}`,
          messages,
          updatedAt: new Date().toISOString(),
        }
      }),
    )
  }, [])
  const {
    messages,
    setMessages,
    loading: chatLoading,
    error: chatError,
    sendChatMessage,
  } = useChat(appendTrace, storedData.sessions?.[0]?.messages ?? [], activeContextId, updateSessionMessages)

  const requestHeaders = useMemo(() => buildHeaderMap(headers, authToken, authMode, oauthToken), [headers, authMode, authToken, oauthToken])
  const activeMessageEndpoint = card?.url || card?.endpoint || endpoint
  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? sessions[0],
    [activeSessionId, sessions],
  )
  const activeAgentName = card?.name || activeSession?.agentCard?.name || servers.find((server) => server.endpoint === endpoint)?.name || null
  const visibleArtifacts = useMemo(
    () =>
      messages.flatMap((message) =>
        (message.artifacts ?? []).filter((artifact) => {
          const artifactText = normalizeArtifactText(artifact.content)
          return Boolean(artifactText)
        }),
      ),
    [messages],
  )
  const activeSessionLogs = useMemo(
    () =>
      logs.filter((log) => {
        if (log.kind === 'agent-card') return Boolean(endpoint && log.request && JSON.stringify(log.request).includes(endpoint))
        return log.contextId === activeContextId
      }),
    [activeContextId, endpoint, logs],
  )
  const visibleSessionLogs = useMemo(
    () => activeSessionLogs.filter((log) => !clearedSessionTraceIds.has(log.id)),
    [activeSessionLogs, clearedSessionTraceIds],
  )
  const inspectorLogs = useMemo(
    () =>
      selectedTraceMessageId
        ? visibleSessionLogs.filter((log) => log.messageId === selectedTraceMessageId)
        : visibleSessionLogs,
    [selectedTraceMessageId, visibleSessionLogs],
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
                title: session.renamed || session.sessionKind === 'mcp' ? session.title : messages[0]?.content.slice(0, 42) || 'New agent session',
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
      // MCP servers don't serve agent cards — skip the A2A health probe
      if (server.serverKind === 'mcp') {
        setServerStatus((current) => ({ ...current, [server.id]: 'unknown' }))
        return
      }
      setServerStatus((current) => ({ ...current, [server.id]: 'checking' }))
      try {
        await fetchAgentCard(
          server.endpoint,
          buildHeaderMap(
            server.headers,
            server.authToken,
            resolveAuthMode(server.authMode, server.authToken, server.oauthToken),
            server.oauthToken,
          ),
        )
        if (!cancelled) {
          setServerStatus((current) => ({ ...current, [server.id]: 'online' }))
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
      if (!activeSessionId) {
        createSession({
          keepConnection: true,
          connected: true,
          endpointValue: endpoint.trim(),
          agentCard: nextCard,
        })
      }
      return
    }

    setEndpointProvided(false)
    setNotification(
      nextCard
        ? 'Unable to connect. Agent card is invalid for A2A 0.3.0. Check that it includes name, url, and skills.'
        : 'Unable to connect. If this is a CORS issue, the agent card server must allow browser requests. Try a different agent card.',
    )
  }

  const handleFetchAgentCardFromDirectEndpoint = async () => {
    if (!endpoint.trim()) return

    const baseEndpoint = endpoint.trim().replace(/\/+$/, '')
    const candidateEndpoints = [
      `${baseEndpoint}/.well-known/agent-card.json`,
      `${baseEndpoint}/agent-card.json`,
      `${baseEndpoint}/agent.json`,
    ]

    setNotification(null)
    for (const candidate of candidateEndpoints) {
      const nextCard = await loadAgentCard(candidate, requestHeaders)
      if (nextCard && validateAgentCard(nextCard).valid) {
        setEndpoint(candidate)
        setEndpointProvided(true)
        setSelectedTraceMessageId(null)
        if (!activeSessionId) {
          createSession({
            keepConnection: true,
            connected: true,
            endpointValue: candidate,
            agentCard: nextCard,
          })
        }
        return
      }
    }

    setEndpointProvided(false)
    setNotification(
      'Unable to connect from that URL. Tried /.well-known/agent-card.json, /agent-card.json, and /agent.json.',
    )
  }

  const handleEndpointChange = (value: string) => {
    setEndpoint(value)
    setEndpointProvided(false)
    clearAgentCard()
    setNotification(null)
  }

  const handleDisconnectAgent = () => {
    if (!activeSessionId) return
    setEndpointProvided(false)
    setSessions((current) =>
      current.map((session) =>
        session.id === activeSessionId
          ? { ...session, connected: false, agentCard: card ?? session.agentCard ?? null, updatedAt: new Date().toISOString() }
          : session,
      ),
    )
    setNotification('Agent disconnected.')
  }

  const createSession = ({
    keepConnection = false,
    connected = endpointProvided,
    endpointValue = endpoint,
    agentCard = card,
    sessionKind = 'agent' as 'agent' | 'mcp',
  }: {
    keepConnection?: boolean
    connected?: boolean
    endpointValue?: string
    agentCard?: typeof card
    sessionKind?: 'agent' | 'mcp'
  } = {}) => {
    const id = crypto.randomUUID()
    const contextId = crypto.randomUUID()
    const defaultTitle = sessionKind === 'mcp' ? 'New MCP session' : 'New agent session'
    const nextSession: ChatSession = {
      id,
      title: defaultTitle,
      subtitle: 'No messages yet',
      messages: [],
      endpoint: keepConnection ? endpointValue : '',
      contextId,
      connected: keepConnection ? connected : false,
      agentCard: keepConnection ? agentCard ?? null : null,
      updatedAt: new Date().toISOString(),
      sessionKind,
    }
    setSessions((current) => [nextSession, ...current])
    setActiveSessionId(id)
    setActiveContextId(contextId)
    setActivePage('playground')
    setMessages([])
    if (!keepConnection) {
      setEndpoint('')
      setEndpointProvided(false)
      clearAgentCard()
      setMcpServerInfo(null)
      setMcpTools([])
      setMcpResources([])
      setMcpPrompts([])
    }
    setSelectedTraceMessageId(null)
    return { id, contextId }
  }

  const handleNewSession = () => {
    createSession({ keepConnection: false, sessionKind: 'agent' })
  }

  const handleNewMcpSession = () => {
    createSession({ keepConnection: false, sessionKind: 'mcp' })
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
    // Restore MCP state if it's an MCP session
    if (nextSession.sessionKind === 'mcp') {
      setMcpServerInfo(nextSession.mcpServerInfo ?? null)
      setMcpTools(nextSession.mcpTools ?? [])
      setMcpResources(nextSession.mcpResources ?? [])
      setMcpPrompts(nextSession.mcpPrompts ?? [])
    } else {
      setMcpServerInfo(null)
      setMcpTools([])
      setMcpResources([])
      setMcpPrompts([])
      if (nextSession.connected && nextSession.endpoint && !nextSession.agentCard) {
        void loadAgentCard(nextSession.endpoint, requestHeaders)
      }
    }
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

  const handleResetAllData = () => {
    setSessions([])
    setServers([])
    clearLogs()
    setMessages([])
    setServerStatus({})
    setClearedSessionTraceIds(new Set())
    setActiveSessionId('')
    setActiveContextId(crypto.randomUUID())
    setEndpoint('')
    setEndpointProvided(false)
    setAuthMode('none')
    setAuthToken('')
    setOauthToken('')
    setHeaders([])
    setSelectedTraceMessageId(null)
    setActivePage('playground')
    clearAgentCard()
    localStorage.removeItem(STORAGE_KEY)
    setNotification('Playground reset. All servers, chats, monitoring data, and traces were removed.')
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
    setClearedSessionTraceIds((current) => {
      const next = new Set(current)
      activeSessionLogs.forEach((log) => next.add(log.id))
      return next
    })
    setSelectedTraceMessageId(null)
    setNotification('Session traces cleared.')
  }

  const handleClearAllTraces = () => {
    clearLogs()
    setClearedSessionTraceIds(new Set())
    setNotification('All traces cleared.')
  }

  const handleSaveServer = (server: Omit<A2AServer, 'id' | 'createdAt'>) => {
    const nextServer = {
      ...server,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }
    setServers((current) => [nextServer, ...current])
    setEndpoint(nextServer.endpoint)
    setAuthMode(resolveAuthMode(nextServer.authMode, nextServer.authToken, nextServer.oauthToken))
    setAuthToken(nextServer.authToken)
    setOauthToken(nextServer.oauthToken ?? '')
    setHeaders(nextServer.headers)
    setEndpointProvided(false)
  }

  const handleUpdateServer = (id: string, server: Omit<A2AServer, 'id' | 'createdAt'>) => {
    const previous = servers.find((item) => item.id === id)
    const changed =
      previous &&
      (previous.name !== server.name ||
        previous.endpoint !== server.endpoint ||
        previous.authMode !== server.authMode ||
        previous.authToken !== server.authToken ||
        previous.oauthToken !== server.oauthToken ||
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
      setAuthMode(resolveAuthMode(server.authMode, server.authToken, server.oauthToken))
      setAuthToken(server.authToken)
      setOauthToken(server.oauthToken ?? '')
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
    setAuthMode(resolveAuthMode(server.authMode, server.authToken, server.oauthToken))
    setAuthToken(server.authToken)
    setOauthToken(server.oauthToken ?? '')
    setHeaders(server.headers)
    setEndpointProvided(false)
    setNotification(null)

    if (server.serverKind === 'mcp') {
      clearAgentCard()
      setMcpServerInfo(null)
      setMcpTools([])
      setMcpResources([])
      setMcpPrompts([])
      setEndpoint(server.endpoint)
    } else {
      setEndpoint(server.endpoint)
      clearAgentCard()
    }
  }

  // Pre-fill endpoint/auth from a saved MCP server without creating a new session
  const handleSelectMcpServer = (server: A2AServer) => {
    setEndpoint(server.endpoint)
    setAuthMode(resolveAuthMode(server.authMode, server.authToken, server.oauthToken))
    setAuthToken(server.authToken)
    setOauthToken(server.oauthToken ?? '')
    setHeaders(server.headers)
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

  const handleClearMcpMessage = (id: string) => {
    setMessages((current) => {
      const idx = current.findIndex((m) => m.id === id)
      const idsToRemove = new Set([id])
      if (idx >= 0 && idx + 1 < current.length && current[idx + 1].role === 'agent') {
        idsToRemove.add(current[idx + 1].id)
      }
      return current.filter((m) => !idsToRemove.has(m.id))
    })
  }

  const handleReplayTrace = (trace: TraceLog) => {
    if (trace.kind !== 'request') return
    const replayText = trace.displayText?.trim()
    if (!replayText || !activeMessageEndpoint.trim()) return
    sendChatMessage(activeMessageEndpoint.trim(), replayText, streaming, activeContextId, requestHeaders)
  }

  const handleRefreshAgentCard = async () => {
    const nextEndpoint = endpoint.trim()
    if (!nextEndpoint) {
      setNotification('No agent card URL available to refresh.')
      return
    }

    const nextCard = await loadAgentCard(nextEndpoint, requestHeaders)
    if (nextCard && validateAgentCard(nextCard).valid) {
      setEndpointProvided(true)
      setNotification('Agent card refreshed.')
      return
    }

    setEndpointProvided(false)
    setNotification('Unable to refresh agent card. Check endpoint and credentials.')
  }

  // ─── MCP handlers ──────────────────────────────────────────────────────────

  const handleMcpConnect = async () => {
    if (!endpoint.trim()) return
    setMcpLoading(true)
    setNotification(null)
    try {
      const info = await initializeMcp(endpoint.trim(), requestHeaders)
      const [tools, resources, prompts] = await Promise.all([
        listMcpTools(endpoint.trim(), requestHeaders),
        listMcpResources(endpoint.trim(), requestHeaders),
        listMcpPrompts(endpoint.trim(), requestHeaders),
      ])
      setMcpServerInfo(info)
      setMcpTools(tools)
      setMcpResources(resources)
      setMcpPrompts(prompts)
      setEndpointProvided(true)
      // Persist MCP data in the session
      setSessions((current) =>
        current.map((s) =>
          s.id === activeSessionId
            ? {
                ...s,
                endpoint: endpoint.trim(),
                connected: true,
                mcpServerInfo: info,
                mcpTools: tools,
                mcpResources: resources,
                mcpPrompts: prompts,
                title: info.name,
                subtitle: `${tools.length} tool${tools.length !== 1 ? 's' : ''}`,
                updatedAt: new Date().toISOString(),
              }
            : s,
        ),
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to connect to MCP server.'
      setNotification(`MCP connection failed: ${msg}`)
      console.error('[MCP connect]', err)
      setEndpointProvided(false)
    } finally {
      setMcpLoading(false)
    }
  }

  const handleMcpToolCall = async (name: string, args: Record<string, unknown>) => {
    const callId = crypto.randomUUID()
    const resultId = crypto.randomUUID()
    const startedAt = Date.now()
    const callMsg: ChatMessage = {
      id: callId,
      role: 'user',
      content: `${name}(${JSON.stringify(args, null, 2)})`,
      rawJson: { method: 'tools/call', params: { name, arguments: args } },
      createdAt: new Date().toISOString(),
    }
    const placeholderMsg: ChatMessage = {
      id: resultId,
      role: 'agent',
      content: '',
      isStreaming: true,
      createdAt: new Date().toISOString(),
    }
    setMessages([callMsg, placeholderMsg])

    try {
      const result = await callMcpTool(endpoint.trim(), name, args, requestHeaders)
      const durationMs = Date.now() - startedAt
      const resultMsg: ChatMessage = {
        id: resultId,
        role: 'agent',
        content: result.text,
        rawJson: result.raw,
        isStreaming: false,
        status: result.isError ? 'error' : 'ok',
        createdAt: new Date().toISOString(),
      }
      setMessages((current) =>
        current.map((m) => (m.id === resultId ? resultMsg : m)),
      )
      setSessions((current) =>
        current.map((s) => {
          if (s.id !== activeSessionId) return s
          const messages = s.messages.map((m) => (m.id === resultId ? resultMsg : m))
          const finalMessages = s.messages.some((m) => m.id === callId)
            ? messages
            : [...messages, callMsg, resultMsg]
          return { ...s, messages: finalMessages, updatedAt: new Date().toISOString() }
        }),
      )
      appendTrace({
        label: `tools/call: ${name}`,
        kind: 'request',
        contextId: activeContextId,
        messageId: resultId,
        displayText: name,
        requestTimestamp: callMsg.createdAt,
        request: { method: 'tools/call', params: { name, arguments: args } },
        response: result.raw,
        status: result.isError ? 'error' : 'ok',
        durationMs,
      })
    } catch (err) {
      const durationMs = Date.now() - startedAt
      const msg = err instanceof Error ? err.message : 'Tool call failed.'
      const errMsg: ChatMessage = {
        id: resultId,
        role: 'agent',
        content: msg,
        isStreaming: false,
        status: 'error',
        createdAt: new Date().toISOString(),
      }
      setMessages((current) => current.map((m) => (m.id === resultId ? errMsg : m)))
      appendTrace({
        label: `tools/call: ${name}`,
        kind: 'request',
        contextId: activeContextId,
        messageId: resultId,
        displayText: name,
        requestTimestamp: callMsg.createdAt,
        request: { method: 'tools/call', params: { name, arguments: args } },
        response: { error: msg },
        status: 'error',
        durationMs,
      })
    }
  }

  const handleMcpReadResource = async (uri: string, name: string) => {
    const callId = crypto.randomUUID()
    const resultId = crypto.randomUUID()
    const startedAt = Date.now()
    const callMsg: ChatMessage = {
      id: callId,
      role: 'user',
      content: `read resource: ${name} (${uri})`,
      rawJson: { method: 'resources/read', params: { uri } },
      createdAt: new Date().toISOString(),
    }
    const placeholderMsg: ChatMessage = {
      id: resultId,
      role: 'agent',
      content: '',
      isStreaming: true,
      createdAt: new Date().toISOString(),
    }
    setMessages([callMsg, placeholderMsg])

    try {
      const content = await readMcpResource(endpoint.trim(), uri, requestHeaders)
      const durationMs = Date.now() - startedAt
      const text = (() => {
        if (content.text) return content.text
        if (content.blob) {
          const mime = content.mimeType ?? ''
          if (mime.startsWith('text/') || mime.includes('html') || mime.includes('svg')) {
            try { return atob(content.blob) } catch { /* fall through */ }
          }
          return `[Binary: ${mime || 'data'}]`
        }
        return 'Empty resource'
      })()
      const resultMsg: ChatMessage = {
        id: resultId,
        role: 'agent',
        content: text,
        rawJson: content,
        isStreaming: false,
        status: 'ok',
        createdAt: new Date().toISOString(),
      }
      setMessages((current) => current.map((m) => (m.id === resultId ? resultMsg : m)))
      appendTrace({
        label: `resources/read: ${name}`,
        kind: 'request',
        contextId: activeContextId,
        messageId: resultId,
        displayText: name,
        requestTimestamp: callMsg.createdAt,
        request: { method: 'resources/read', params: { uri } },
        response: content,
        status: 'ok',
        durationMs,
      })
    } catch (err) {
      const durationMs = Date.now() - startedAt
      const msg = err instanceof Error ? err.message : 'Resource read failed.'
      const errMsg: ChatMessage = {
        id: resultId,
        role: 'agent',
        content: msg,
        isStreaming: false,
        status: 'error',
        createdAt: new Date().toISOString(),
      }
      setMessages((current) => current.map((m) => (m.id === resultId ? errMsg : m)))
      appendTrace({
        label: `resources/read: ${name}`,
        kind: 'request',
        contextId: activeContextId,
        messageId: resultId,
        displayText: name,
        requestTimestamp: callMsg.createdAt,
        request: { method: 'resources/read', params: { uri } },
        response: { error: msg },
        status: 'error',
        durationMs,
      })
    }
  }

  const handleMcpRunPrompt = async (name: string, args: Record<string, string>) => {
    const callId = crypto.randomUUID()
    const resultId = crypto.randomUUID()
    const startedAt = Date.now()
    const callMsg: ChatMessage = {
      id: callId,
      role: 'user',
      content: `run prompt: ${name}(${JSON.stringify(args)})`,
      rawJson: { method: 'prompts/get', params: { name, arguments: args } },
      createdAt: new Date().toISOString(),
    }
    const placeholderMsg: ChatMessage = {
      id: resultId,
      role: 'agent',
      content: '',
      isStreaming: true,
      createdAt: new Date().toISOString(),
    }
    setMessages([callMsg, placeholderMsg])

    try {
      const text = await getMcpPrompt(endpoint.trim(), name, args, requestHeaders)
      const durationMs = Date.now() - startedAt
      const resultMsg: ChatMessage = {
        id: resultId,
        role: 'agent',
        content: text,
        rawJson: { text },
        isStreaming: false,
        status: 'ok',
        createdAt: new Date().toISOString(),
      }
      setMessages((current) => current.map((m) => (m.id === resultId ? resultMsg : m)))
      appendTrace({
        label: `prompts/get: ${name}`,
        kind: 'request',
        contextId: activeContextId,
        messageId: resultId,
        displayText: name,
        requestTimestamp: callMsg.createdAt,
        request: { method: 'prompts/get', params: { name, arguments: args } },
        response: { text },
        status: 'ok',
        durationMs,
      })
    } catch (err) {
      const durationMs = Date.now() - startedAt
      const msg = err instanceof Error ? err.message : 'Prompt failed.'
      const errMsg: ChatMessage = {
        id: resultId,
        role: 'agent',
        content: msg,
        isStreaming: false,
        status: 'error',
        createdAt: new Date().toISOString(),
      }
      setMessages((current) => current.map((m) => (m.id === resultId ? errMsg : m)))
      appendTrace({
        label: `prompts/get: ${name}`,
        kind: 'request',
        contextId: activeContextId,
        messageId: resultId,
        displayText: name,
        requestTimestamp: callMsg.createdAt,
        request: { method: 'prompts/get', params: { name, arguments: args } },
        response: { error: msg },
        status: 'error',
        durationMs,
      })
    }
  }

  // ─── Export / Import ───────────────────────────────────────────────────────

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
        authMode={authMode}
        authToken={authToken}
        oauthToken={oauthToken}
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
        onNewMcpSession={handleNewMcpSession}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        onDeleteAllSessions={handleDeleteAllSessions}
        onRenameSession={handleRenameSession}
        onExportData={handleExportData}
        onImportData={handleImportData}
        onResetAllData={handleResetAllData}
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
          <MonitoringPage logs={logs} onClearTraces={handleClearAllTraces} onReplayTrace={handleReplayTrace} />
        ) : activeSession?.sessionKind === 'mcp' ? (
          <McpChatWindow
            sessionTitle={activeSession?.title ?? 'MCP session'}
            messages={messages}
            endpoint={endpoint}
            authMode={authMode}
            authToken={authToken}
            oauthToken={oauthToken}
            headers={headers}
            servers={servers}
            endpointProvided={endpointProvided}
            agentLoading={mcpLoading}
            hasSession={Boolean(activeSessionId)}
            mcpServerInfo={mcpServerInfo}
            mcpTools={mcpTools}
            mcpResources={mcpResources}
            mcpPrompts={mcpPrompts}
            onEndpointChange={handleEndpointChange}
            onAuthModeChange={setAuthMode}
            onAuthTokenChange={setAuthToken}
            onOauthTokenChange={setOauthToken}
            onHeadersChange={setHeaders}
            onSelectMcpServer={handleSelectMcpServer}
            onConnect={handleMcpConnect}
            onDisconnect={() => {
              clearMcpSession(endpoint)
              setEndpointProvided(false)
              setMcpServerInfo(null)
              setMcpTools([])
              setMcpResources([])
              setMcpPrompts([])
              setSessions((current) =>
                current.map((s) =>
                  s.id === activeSessionId
                    ? { ...s, connected: false, mcpServerInfo: null, mcpTools: [], mcpResources: [], mcpPrompts: [], updatedAt: new Date().toISOString() }
                    : s,
                ),
              )
            }}
            onCallTool={handleMcpToolCall}
            onReadResource={handleMcpReadResource}
            onRunPrompt={handleMcpRunPrompt}
            onClearMessage={handleClearMcpMessage}
            onClear={() => {
              setMessages([])
              setSessions((current) =>
                current.map((s) =>
                  s.id === activeSessionId
                    ? { ...s, messages: [], subtitle: 'No messages yet', updatedAt: new Date().toISOString() }
                    : s,
                ),
              )
            }}
            onDeleteSession={() => {
              if (activeSessionId) handleDeleteSession(activeSessionId)
            }}
          />
        ) : (
          <ChatWindow
            sessionTitle={sessions.find((session) => session.id === activeSessionId)?.title ?? 'New agent session'}
            agentName={activeAgentName}
            messages={messages}
            loading={chatLoading}
            error={chatError}
            streaming={streaming}
            disabled={!activeMessageEndpoint.trim()}
            endpoint={endpoint}
            authMode={authMode}
            authToken={authToken}
            oauthToken={oauthToken}
            headers={headers}
            servers={servers}
            endpointProvided={endpointProvided}
            agentLoading={agentLoading}
            hasSession={Boolean(activeSessionId)}
            onEndpointChange={handleEndpointChange}
            onAuthModeChange={setAuthMode}
            onAuthTokenChange={setAuthToken}
            onOauthTokenChange={setOauthToken}
            onHeadersChange={setHeaders}
            onSelectServer={handleSelectServer}
            onConnect={handleFetchAgentCard}
            onConnectDirect={handleFetchAgentCardFromDirectEndpoint}
            onDisconnect={handleDisconnectAgent}
            onStreamingChange={setStreaming}
            onSend={handleSendMessage}
            onClear={handleClearAndStartNewSession}
            onDeleteSession={() => {
              if (activeSessionId) handleDeleteSession(activeSessionId)
            }}
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
        artifacts={visibleArtifacts}
        onReplayTrace={handleReplayTrace}
        onRefreshAgentCard={handleRefreshAgentCard}
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
