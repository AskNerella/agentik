import type {
  A2AJsonRpcMessageRequest,
  AgentCard,
  McpUIResource,
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
  try {
    const url = new URL(endpoint)
    if (!['http:', 'https:'].includes(url.protocol)) return endpoint
    const proxyBase = import.meta.env.VITE_A2A_PROXY_BASE || '/proxy/request'
    return `${proxyBase}?url=${encodeURIComponent(url.toString())}`
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
    return parts
      .filter((part) => {
        if (!part || typeof part !== 'object') return true
        const p = part as Record<string, unknown>
        if (p.kind !== 'text') return true
        const meta = p.metadata && typeof p.metadata === 'object' ? (p.metadata as Record<string, unknown>) : null
        const mimeType = meta && typeof meta.mimeType === 'string' ? meta.mimeType : ''
        return !mimeType.includes('mcp-app')
      })
      .map((part) => extractText(part))
      .filter(Boolean)
      .join('')
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

function getA2AState(value: unknown) {
  if (!value || typeof value !== 'object') return null

  const record = value as Record<string, unknown>
  const result = record.result && typeof record.result === 'object' ? (record.result as Record<string, unknown>) : record
  const status = result.status && typeof result.status === 'object' ? (result.status as Record<string, unknown>) : null

  return typeof result.state === 'string' ? result.state : status && typeof status.state === 'string' ? status.state : null
}

function summarizeFailedA2AEvent(value: unknown) {
  if (!value || typeof value !== 'object') return 'Task failed.'

  const record = value as Record<string, unknown>
  const result = record.result && typeof record.result === 'object' ? (record.result as Record<string, unknown>) : record
  const status = result.status && typeof result.status === 'object' ? (result.status as Record<string, unknown>) : null
  const id = typeof result.id === 'string' ? result.id : typeof result.taskId === 'string' ? result.taskId : null
  const detail = extractText(status?.message ?? status ?? result)

  if (detail && !/^failed$/i.test(detail.trim())) return id ? `Task ${id} failed: ${detail}` : `Task failed: ${detail}`
  return id ? `Task ${id} failed.` : 'Task failed.'
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
  const state = getA2AState(value)

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

function extractUIResources(value: unknown): McpUIResource[] {
  if (!value || typeof value !== 'object') return []
  const resources: McpUIResource[] = []
  const record = value as Record<string, unknown>
  const result =
    record.result && typeof record.result === 'object' ? (record.result as Record<string, unknown>) : record

  const partSources: unknown[] = [
    result.parts,
    result.message && typeof result.message === 'object'
      ? (result.message as Record<string, unknown>).parts
      : null,
  ]

  if (Array.isArray(result.history)) {
    for (const entry of result.history) {
      if (entry && typeof entry === 'object') {
        partSources.push((entry as Record<string, unknown>).parts)
      }
    }
  }

  if (result.artifact && typeof result.artifact === 'object') {
    partSources.push((result.artifact as Record<string, unknown>).parts)
  }

  // Agent-composer often returns MCP UI parts under result.artifacts[].parts.
  if (Array.isArray(result.artifacts)) {
    for (const artifact of result.artifacts) {
      if (artifact && typeof artifact === 'object') {
        partSources.push((artifact as Record<string, unknown>).parts)
      }
    }
  }

  for (const parts of partSources) {
    if (!Array.isArray(parts)) continue
    for (const part of parts) {
      if (!part || typeof part !== 'object') continue
      const p = part as Record<string, unknown>

      const meta = p.metadata && typeof p.metadata === 'object' ? (p.metadata as Record<string, unknown>) : null
      const partMimeType = meta && typeof meta.mimeType === 'string' ? meta.mimeType : ''

      if (p.kind === 'text' && typeof p.text === 'string' && partMimeType.includes('mcp-app')) {
        resources.push({
          uri: `ui://agent/${crypto.randomUUID()}`,
          mimeType: 'text/html;profile=mcp-app',
          text: p.text,
        })
        continue
      }

      if (p.kind !== 'resource' || !p.resource || typeof p.resource !== 'object') continue
      const r = p.resource as Record<string, unknown>
      const mimeType = typeof r.mimeType === 'string' ? r.mimeType : ''
      if (!mimeType.includes('mcp-app')) continue
      resources.push({
        uri: typeof r.uri === 'string' ? r.uri : `ui://unknown/${crypto.randomUUID()}`,
        mimeType: 'text/html;profile=mcp-app',
        text: typeof r.text === 'string' ? r.text : undefined,
        blob: typeof r.blob === 'string' ? r.blob : undefined,
      })
    }
  }

  return resources
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
  const uiResources = extractUIResources(response)
  const failed = getA2AState(response) === 'failed'

  return {
    reply: failed
      ? summarizeFailedA2AEvent(response)
      : extractText(response) || summarizeA2AEvent(response) || JSON.stringify(response, null, 2),
    status: failed ? 'error' : 'ok',
    artifacts,
    uiResources: uiResources.length > 0 ? uiResources : undefined,
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

    if (getA2AState(parsed) === 'failed') {
      return { type: 'error', content: summarizeFailedA2AEvent(parsed), final: true, raw: parsed }
    }

    const final = isFinalA2AEvent(parsed)

    // Explicit artifact-update handling: filter mcp-app text parts from text, extract as UI resources
    const chunkKind = typeof parsed.kind === 'string' ? parsed.kind : ''
    if (chunkKind === 'artifact-update' || (parsed.artifact && typeof parsed.artifact === 'object')) {
      const rawParts: unknown[] = Array.isArray(
        (parsed.artifact as Record<string, unknown> | undefined)?.parts,
      )
        ? ((parsed.artifact as Record<string, unknown>).parts as unknown[])
        : []

      const textContent = rawParts
        .filter((p): p is Record<string, unknown> => {
          if (!p || typeof p !== 'object') return false
          const part = p as Record<string, unknown>
          if (part.kind !== 'text') return false
          const meta = part.metadata && typeof part.metadata === 'object' ? (part.metadata as Record<string, unknown>) : null
          const mimeType = meta && typeof meta.mimeType === 'string' ? meta.mimeType : ''
          return !mimeType.includes('mcp-app')
        })
        .map((p) => (typeof p.text === 'string' ? p.text : ''))
        .join('')

      const artifactUiResources: McpUIResource[] = rawParts
        .filter((p): p is Record<string, unknown> => {
          if (!p || typeof p !== 'object') return false
          const part = p as Record<string, unknown>
          if (part.kind !== 'text' || typeof part.text !== 'string') return false
          const meta = part.metadata && typeof part.metadata === 'object' ? (part.metadata as Record<string, unknown>) : null
          const mimeType = meta && typeof meta.mimeType === 'string' ? meta.mimeType : ''
          return mimeType.includes('mcp-app')
        })
        .map((p) => {
          const meta = p.metadata as Record<string, unknown>
          return {
            uri: `ui://chunk-${Date.now()}-${crypto.randomUUID()}`,
            mimeType: (typeof meta?.mimeType === 'string' ? meta.mimeType : 'text/html;profile=mcp-app') as McpUIResource['mimeType'],
            text: p.text as string,
          }
        })

      const uiResourcesProp = artifactUiResources.length > 0 ? artifactUiResources : undefined
      if (textContent || uiResourcesProp) {
        return { type: 'token', content: textContent || undefined, final, uiResources: uiResourcesProp, raw: parsed }
      }
    }

    const artifact = extractArtifact(parsed)
    const uiResources = extractUIResources(parsed)
    const uiResourcesProp = uiResources.length > 0 ? uiResources : undefined

    if (artifact) {
      return { type: final ? 'token' : 'status', content: artifact.content, final, artifact, uiResources: uiResourcesProp, raw: parsed }
    }

    const text = extractText(parsed)
    if (text) {
      return { type: 'token', content: text, final, uiResources: uiResourcesProp, raw: parsed }
    }

    const summary = summarizeA2AEvent(parsed)
    if (summary) {
      return { type: final ? 'token' : 'status', content: summary, final, uiResources: uiResourcesProp, raw: parsed }
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
