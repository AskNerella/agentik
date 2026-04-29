export type AgentSkill = {
  id?: string
  name: string
  description: string
  tags?: string[]
}

export type AgentCard = {
  name: string
  description: string
  url: string
  endpoint?: string
  skills: AgentSkill[]
}

export type MessageRequest = {
  message: string
  stream?: boolean
}

export type A2AJsonRpcMessageRequest = {
  jsonrpc: '2.0'
  id: string
  method: 'message/send' | 'message/stream'
  params: {
    message: {
      role: 'user'
      parts: {
        kind: 'text'
        text: string
      }[]
      messageId: string
      contextId: string
    }
  }
}

export type MessageResponse = {
  reply: string
  status: 'ok' | 'error'
  artifacts?: AgentArtifact[]
}

export type StreamChunk = {
  type: 'token' | 'status' | 'done' | 'error'
  content?: string
  final?: boolean
  artifact?: AgentArtifact
  raw?: unknown
}

export type AgentArtifact = {
  id: string
  name: string
  content: string
  createdAt: string
}

export type HeaderPair = {
  id: string
  key: string
  value: string
}

export type AuthMode = 'none' | 'bearer' | 'oauth2'

export type ChatMessage = {
  id: string
  role: 'user' | 'agent' | 'system'
  content: string
  isStreaming?: boolean
  statusUpdates?: string[]
  trackerCollapsed?: boolean
  artifacts?: AgentArtifact[]
  status?: 'ok' | 'error'
  createdAt: string
}

export type TraceLog = {
  id: string
  label: string
  kind: 'request' | 'response' | 'stream' | 'agent-card'
  requestId?: string
  messageId?: string
  contextId?: string
  displayText?: string
  requestTimestamp?: string
  request: unknown
  response: unknown
  status: 'ok' | 'error'
  durationMs: number
  timestamp: string
}

export type ChatSession = {
  id: string
  title: string
  subtitle: string
  messages: ChatMessage[]
  endpoint: string
  contextId: string
  connected: boolean
  agentCard?: AgentCard | null
  renamed?: boolean
  updatedAt: string
}

export type A2AServer = {
  id: string
  name: string
  endpoint: string
  authMode?: AuthMode
  authToken: string
  oauthToken?: string
  headers: HeaderPair[]
  createdAt: string
}

export type PlaygroundExport = {
  version: 1
  exportedAt: string
  sessions: ChatSession[]
  servers: A2AServer[]
  traces: TraceLog[]
}
