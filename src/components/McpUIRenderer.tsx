import { AppRenderer } from '@mcp-ui/client'
import type { AppRendererProps } from '@mcp-ui/client'
import type { McpUIResource } from '../types/a2a'

type OnCallTool = NonNullable<AppRendererProps['onCallTool']>
type OnOpenLink = NonNullable<AppRendererProps['onOpenLink']>

type Props = {
  resource: McpUIResource
  onSend?: (message: string) => void
}

function getToolName(uri: string): string {
  try {
    const url = new URL(uri)
    const path = url.pathname.replace(/^\//, '')
    return path || url.hostname || uri
  } catch {
    return uri.replace(/^ui:\/\//, '') || 'embedded-ui'
  }
}

function decodeHtml(resource: McpUIResource): string | undefined {
  if (resource.text) return resource.text
  if (resource.blob) {
    try {
      return atob(resource.blob)
    } catch {
      return undefined
    }
  }
  return undefined
}

export function McpUIRenderer({ resource, onSend }: Props) {
  const html = decodeHtml(resource)
  const toolName = getToolName(resource.uri)
  const sandboxUrl = new URL('/mcp-ui-sandbox.html', window.location.href)

  const handleCallTool: OnCallTool = async (params) => {
    const argsText = params.arguments ? JSON.stringify(params.arguments, null, 2) : ''
    onSend?.(`[Tool: ${params.name}]${argsText ? `\n${argsText}` : ''}`)
    return { content: [{ type: 'text', text: 'Tool call forwarded to agent.' }] }
  }

  const handleOpenLink: OnOpenLink = async ({ url }) => {
    window.open(url, '_blank', 'noopener,noreferrer')
    return {}
  }

  if (!html) {
    return (
      <div className="mcp-ui-resource mcp-ui-resource--empty">
        <span>UI resource has no renderable content.</span>
      </div>
    )
  }

  return (
    <div className="mcp-ui-resource">
      <AppRenderer
        toolName={toolName}
        html={html}
        sandbox={{ url: sandboxUrl }}
        onOpenLink={handleOpenLink}
        onCallTool={handleCallTool}
        onError={(error) => console.error('[MCP UI] Render error:', error)}
      />
    </div>
  )
}
