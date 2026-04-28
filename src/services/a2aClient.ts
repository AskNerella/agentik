import type {
  A2AJsonRpcMessageRequest,
  AgentCard,
  MessageRequest,
  MessageResponse,
  StreamChunk,
} from '../types/a2a'

function buildHeaders(headers?: Record<string, string>, includeContentType = true) {
  return {
    Accept: 'application/json, text/event-stream, text/plain',
    ...(includeContentType ? { 'Content-Type': 'application/json' } : {}),
    ...headers,
  }
}

function normalizeFetchError(caught: unknown) {
  if (caught instanceof TypeError) {
    return new Error(
      'Agent card not found or unavailable. Check the URL, server status, and gateway configuration.',
    )
  }

  return caught
}

function toProxyUrl(endpoint: string) {
  if (!import.meta.env.DEV) return endpoint

  try {
    const url = new URL(endpoint)
    return `/api${url.pathname}${url.search}`
  } catch {
    return endpoint
  }
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text()
  let payload: unknown

  try {
    payload = text ? JSON.parse(text) : {}
  } catch {
    payload = text
  }

  if (!response.ok) {
    const statusText =
      response.status === 404
        ? 'Not Found'
        : response.status === 504
          ? 'Gateway Timeout'
          : response.statusText || `HTTP ${response.status}`
    if (payload && typeof payload === 'object') {
      const record = payload as Record<string, unknown>
      throw new Error(
          (typeof record.message === 'string' && record.message) ||
          (typeof record.error === 'string' && record.error) ||
          `Request failed: ${statusText}`,
      )
    }

    throw new Error(typeof payload === 'string' && payload ? payload : `Request failed: ${statusText}`)
  }

  return payload as T
}

export function createJsonRpcMessagePayload(
  payload: MessageRequest,
  contextId: string,
): A2AJsonRpcMessageRequest {
  return {
    jsonrpc: '2.0',
    id: crypto.randomUUID(),
    method: payload.stream ? 'message/stream' : 'message/send',
    params: {
      message: {
        role: 'user',
        parts: [
          {
            kind: 'text',
            text: payload.message,
          },
        ],
        messageId: crypto.randomUUID(),
        contextId,
      },
    },
  }
}

function extractText(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return null

  const record = value as Record<string, unknown>
  if (typeof record.text === 'string') return record.text
  if (typeof record.content === 'string') return record.content
  if (typeof record.reply === 'string') return record.reply
  if (typeof record.detail === 'string') return record.detail
  if (typeof record.message === 'string') return record.message

  const parts = record.parts
  if (Array.isArray(parts)) {
    return parts.map((part) => extractText(part)).filter(Boolean).join('')
  }

  const artifacts = record.artifacts
  if (Array.isArray(artifacts)) {
    return artifacts.map((artifact) => extractText(artifact)).filter(Boolean).join('\n')
  }

  if (record.message) return extractText(record.message)
  if (record.status) return extractText(record.status)
  if (record.result) return extractText(record.result)

  return null
}

function summarizeA2AEvent(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null

  const record = value as Record<string, unknown>
  const result = record.result && typeof record.result === 'object' ? (record.result as Record<string, unknown>) : record
  const kind = typeof result.kind === 'string' ? result.kind : typeof result.type === 'string' ? result.type : null
  if (kind?.includes('artifact')) {
    const artifactText = extractText(result.artifact ?? result)
    return artifactText ? `Artifact update: ${artifactText.slice(0, 160)}\n` : 'Artifact update\n'
  }
  const status = result.status && typeof result.status === 'object' ? (result.status as Record<string, unknown>) : null
  const state = typeof result.state === 'string' ? result.state : status && typeof status.state === 'string' ? status.state : null
  const id = typeof result.id === 'string' ? result.id : typeof result.taskId === 'string' ? result.taskId : null
  const finalFlag = typeof result.final === 'boolean' ? result.final : null

  if (state && id) return `Task ${id}: ${state}${finalFlag ? ' (final)' : ''}\n`
  if (state) return `Task status: ${state}${finalFlag ? ' (final)' : ''}\n`
  if (id) return `Task ${id} updated\n`
  if (record.method && typeof record.method === 'string') return `Event: ${record.method}\n`

  return null
}

function extractArtifact(value: unknown) {
  if (!value || typeof value !== 'object') return null

  const record = value as Record<string, unknown>
  const result = record.result && typeof record.result === 'object' ? (record.result as Record<string, unknown>) : record
  const kind = typeof result.kind === 'string' ? result.kind : typeof result.type === 'string' ? result.type : ''
  const artifactValue = result.artifact ?? result
  const artifactRecord =
    artifactValue && typeof artifactValue === 'object' ? (artifactValue as Record<string, unknown>) : undefined

  if (!kind.includes('artifact') && !artifactRecord?.parts && !artifactRecord?.name) return null

  const content = extractText(artifactValue)
  if (!content) return null

  return {
    id:
      (typeof result.artifactId === 'string' && result.artifactId) ||
      (typeof artifactRecord?.artifactId === 'string' && artifactRecord.artifactId) ||
      (typeof artifactRecord?.id === 'string' && artifactRecord.id) ||
      crypto.randomUUID(),
    name:
      (typeof artifactRecord?.name === 'string' && artifactRecord.name) ||
      (typeof artifactRecord?.title === 'string' && artifactRecord.title) ||
      'Artifact',
    content,
    createdAt: new Date().toISOString(),
  }
}

function extractArtifacts(value: unknown) {
  const directArtifact = extractArtifact(value)
  const artifacts = directArtifact ? [directArtifact] : []

  if (!value || typeof value !== 'object') return artifacts

  const record = value as Record<string, unknown>
  const result = record.result && typeof record.result === 'object' ? (record.result as Record<string, unknown>) : record
  const artifactList = result.artifacts ?? record.artifacts

  if (Array.isArray(artifactList)) {
    artifactList.forEach((artifact) => {
      const parsed = extractArtifact(artifact)
      if (parsed) artifacts.push(parsed)
    })
  }

  return artifacts
}

function isFinalA2AEvent(value: unknown) {
  if (!value || typeof value !== 'object') return false

  const record = value as Record<string, unknown>
  const result = record.result && typeof record.result === 'object' ? (record.result as Record<string, unknown>) : record
  const status = result.status && typeof result.status === 'object' ? (result.status as Record<string, unknown>) : null
  const state = typeof result.state === 'string' ? result.state : status && typeof status.state === 'string' ? status.state : null

  return (
    record.lastChunk === true ||
    result.lastChunk === true ||
    result.final === true ||
    state === 'completed' ||
    state === 'succeeded' ||
    state === 'failed' ||
    state === 'canceled'
  )
}

function normalizeMessageResponse(response: unknown): MessageResponse {
  const record = response && typeof response === 'object' ? (response as Record<string, unknown>) : {}
  const error = record.error
  if (error) {
    return {
      reply: extractText(error) || JSON.stringify(error, null, 2),
      status: 'error',
    }
  }

  const artifacts = extractArtifacts(response)

  return {
    reply: extractText(response) || summarizeA2AEvent(response) || JSON.stringify(response, null, 2),
    status: 'ok',
    artifacts,
  }
}

export async function fetchAgentCard(
  endpoint: string,
  headers?: Record<string, string>,
): Promise<AgentCard> {
  try {
    const response = await fetch(toProxyUrl(endpoint), {
      method: 'GET',
      headers: buildHeaders(headers, false),
    })

    return parseJsonResponse<AgentCard>(response)
  } catch (caught) {
    throw normalizeFetchError(caught)
  }
}

export async function sendMessage(
  endpoint: string,
  payload: A2AJsonRpcMessageRequest,
  headers?: Record<string, string>,
): Promise<MessageResponse> {
  const response = await fetch(toProxyUrl(endpoint), {
    method: 'POST',
    headers: buildHeaders(headers),
    body: JSON.stringify(payload),
  })

  const json = await parseJsonResponse<unknown>(response)
  return normalizeMessageResponse(json)
}

function parseStreamLine(line: string): StreamChunk | null {
  const trimmed = line.trim()

  if (trimmed.startsWith(':')) {
    return null
  }

  if (trimmed.startsWith('event:') || trimmed.startsWith('id:') || trimmed.startsWith('retry:')) {
    return null
  }

  if (!trimmed || trimmed === 'data: [DONE]' || trimmed === '[DONE]') {
    return trimmed.includes('[DONE]') ? { type: 'done' } : null
  }

  const normalized = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed

  try {
    const parsed = JSON.parse(normalized)
    if (parsed.type === 'token' || parsed.type === 'done' || parsed.type === 'error') {
      return { ...(parsed as StreamChunk), raw: parsed }
    }

    if (typeof parsed.content === 'string') {
      return { type: 'token', content: parsed.content }
    }

    if (typeof parsed.token === 'string') {
      return { type: 'token', content: parsed.token }
    }

    const final = isFinalA2AEvent(parsed)
    const artifact = extractArtifact(parsed)
    if (artifact) {
      return { type: final ? 'token' : 'status', content: artifact.content, final, artifact, raw: parsed }
    }

    const text = extractText(parsed)
    if (text) {
      return { type: 'token', content: text, final, raw: parsed }
    }

    const summary = summarizeA2AEvent(parsed)
    if (summary) {
      return { type: final ? 'token' : 'status', content: summary, final, raw: parsed }
    }
  } catch {
    return { type: 'token', content: normalized }
  }

  return null
}

export async function streamMessage(
  endpoint: string,
  payload: A2AJsonRpcMessageRequest,
  onChunk: (chunk: StreamChunk) => void,
  headers?: Record<string, string>,
): Promise<void> {
  const response = await fetch(toProxyUrl(endpoint), {
    method: 'POST',
    headers: buildHeaders(headers),
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const text = await response.text()
    const statusText =
      response.status === 404
        ? 'Not Found'
        : response.status === 504
          ? 'Gateway Timeout'
          : response.statusText || `HTTP ${response.status}`
    throw new Error(text || `Stream failed: ${statusText}`)
  }

  if (!response.body) {
    throw new Error('Streaming is not supported by this response')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const chunk = parseStreamLine(line)
      if (chunk) onChunk(chunk)
    }
  }

  const tail = buffer.trim()
  if (tail) {
    const chunk = parseStreamLine(tail)
    if (chunk) onChunk(chunk)
  }

  onChunk({ type: 'done' })
}
