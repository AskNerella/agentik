import type { McpPrompt, McpResource, McpServerInfo, McpTool } from '../types/a2a'

// Per-endpoint session IDs for MCP Streamable HTTP transport.
// Cleared when the user disconnects (see clearMcpSession).
const mcpSessionIds = new Map<string, string>()

export function clearMcpSession(endpoint: string): void {
  mcpSessionIds.delete(endpoint)
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

function buildHeaders(extra?: Record<string, string>) {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    ...extra,
  }
}

async function rpc<T>(
  endpoint: string,
  method: string,
  params: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  const sessionId = mcpSessionIds.get(endpoint)
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: crypto.randomUUID(),
    method,
    params,
  })

  const response = await fetch(toProxyUrl(endpoint), {
    method: 'POST',
    headers: {
      ...buildHeaders(headers),
      ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
    },
    body,
  })

  // Capture session ID returned by the server (MCP Streamable HTTP)
  const newSessionId = response.headers.get('mcp-session-id')
  if (newSessionId) mcpSessionIds.set(endpoint, newSessionId)

  const text = await response.text()

  // MCP Streamable HTTP can respond with either application/json or text/event-stream.
  // When SSE, the response looks like:  data: {...}\n\n
  // Extract the JSON payload from whichever format was used.
  const contentType = response.headers.get('content-type') ?? ''
  let jsonText = text
  if (contentType.includes('text/event-stream')) {
    const dataLine = text
      .split('\n')
      .find((line) => line.startsWith('data:'))
    jsonText = dataLine ? dataLine.slice('data:'.length).trim() : text
  }

  let json: unknown
  try {
    json = JSON.parse(jsonText)
  } catch {
    throw new Error(
      `MCP server returned non-JSON response (${response.status}): ${text.slice(0, 300)}`,
    )
  }

  if (!response.ok) {
    const record = json as Record<string, unknown>
    const msg =
      typeof record?.error === 'object' && record.error
        ? ((record.error as Record<string, unknown>).message as string) ?? JSON.stringify(record.error)
        : `HTTP ${response.status}`
    throw new Error(msg)
  }

  const record = json as Record<string, unknown>
  if (record.error) {
    const error = record.error as Record<string, unknown>
    throw new Error(
      typeof error.message === 'string' ? error.message : JSON.stringify(error),
    )
  }

  return record.result as T
}

// ─── Public API ───────────────────────────────────────────────────────────────

// Send a JSON-RPC notification (no id, no response expected).
async function notify(
  endpoint: string,
  method: string,
  params: unknown,
  headers?: Record<string, string>,
): Promise<void> {
  const sessionId = mcpSessionIds.get(endpoint)
  await fetch(toProxyUrl(endpoint), {
    method: 'POST',
    headers: {
      ...buildHeaders(headers),
      ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', method, params }),
  })
}

export async function initializeMcp(
  endpoint: string,
  headers?: Record<string, string>,
): Promise<McpServerInfo> {
  // Always start a fresh session (clear any stale session ID)
  clearMcpSession(endpoint)

  const result = await rpc<{
    protocolVersion: string
    serverInfo: { name: string; version: string }
    capabilities?: {
      tools?: object
      resources?: object
      prompts?: object
    }
  }>(
    endpoint,
    'initialize',
    {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {}, resources: {}, prompts: {} },
      clientInfo: { name: 'Agentik', version: '1.0.0' },
    },
    headers,
  )

  // Complete the handshake — required by MCP Streamable HTTP before any other calls
  try {
    await notify(endpoint, 'notifications/initialized', {}, headers)
  } catch {
    // Notifications are fire-and-forget; ignore errors
  }

  return {
    name: result.serverInfo?.name ?? 'MCP Server',
    version: result.serverInfo?.version ?? '1.0.0',
    capabilities: result.capabilities,
  }
}

export async function listMcpTools(
  endpoint: string,
  headers?: Record<string, string>,
): Promise<McpTool[]> {
  try {
    const result = await rpc<{ tools: McpTool[] }>(endpoint, 'tools/list', {}, headers)
    return Array.isArray(result.tools) ? result.tools : []
  } catch {
    return []
  }
}

export type McpToolResult = {
  text: string
  isError: boolean
  raw: unknown
  durationMs: number
}

export async function callMcpTool(
  endpoint: string,
  name: string,
  args: Record<string, unknown>,
  headers?: Record<string, string>,
): Promise<McpToolResult> {
  const startedAt = performance.now()
  const result = await rpc<{
    content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>
    isError?: boolean
  }>(endpoint, 'tools/call', { name, arguments: args }, headers)

  const durationMs = Math.round(performance.now() - startedAt)

  const text = (result.content ?? [])
    .map((c) => {
      if (c.type === 'text') return c.text ?? ''
      if (c.type === 'image') return `[Image: ${c.mimeType ?? 'image'}]`
      if (c.type === 'resource') {
        // EmbeddedResource — extract text or decode base64 blob
        const res = (c as Record<string, unknown>).resource as Record<string, unknown> | undefined
        if (!res) return ''
        if (typeof res.text === 'string') return res.text
        if (typeof res.blob === 'string') {
          const mime = typeof res.mimeType === 'string' ? res.mimeType : ''
          if (mime.startsWith('text/') || mime.includes('html') || mime.includes('svg')) {
            try { return atob(res.blob) } catch { /* fall through */ }
          }
          return `[Binary: ${mime || 'data'}]`
        }
        return `[Resource: ${res.uri ?? 'resource'}]`
      }
      return ''
    })
    .join('\n')
    .trim()

  return {
    text: text || JSON.stringify(result, null, 2),
    isError: result.isError ?? false,
    raw: result,
    durationMs,
  }
}

export async function listMcpResources(
  endpoint: string,
  headers?: Record<string, string>,
): Promise<McpResource[]> {
  try {
    const result = await rpc<{ resources: McpResource[] }>(
      endpoint,
      'resources/list',
      {},
      headers,
    )
    return Array.isArray(result.resources) ? result.resources : []
  } catch {
    return []
  }
}

export type McpResourceContent = {
  text?: string
  blob?: string
  mimeType?: string
}

export async function readMcpResource(
  endpoint: string,
  uri: string,
  headers?: Record<string, string>,
): Promise<McpResourceContent> {
  const result = await rpc<{ contents: McpResourceContent[] }>(
    endpoint,
    'resources/read',
    { uri },
    headers,
  )
  return result.contents?.[0] ?? {}
}

export async function listMcpPrompts(
  endpoint: string,
  headers?: Record<string, string>,
): Promise<McpPrompt[]> {
  try {
    const result = await rpc<{ prompts: McpPrompt[] }>(endpoint, 'prompts/list', {}, headers)
    return Array.isArray(result.prompts) ? result.prompts : []
  } catch {
    return []
  }
}

export async function getMcpPrompt(
  endpoint: string,
  name: string,
  args: Record<string, string>,
  headers?: Record<string, string>,
): Promise<string> {
  const result = await rpc<{
    messages: Array<{ role: string; content: { type: string; text?: string } }>
  }>(endpoint, 'prompts/get', { name, arguments: args }, headers)

  return (result.messages ?? [])
    .map((m) => `[${m.role}] ${m.content?.text ?? ''}`)
    .join('\n')
}
