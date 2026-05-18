import { AppRenderer } from '@mcp-ui/client'
import { useMemo } from 'react'
import type { AppRendererProps } from '@mcp-ui/client'
import type { McpUIResource } from '../types/a2a'

type Props = {
  resource: McpUIResource
  onSend?: (message: string) => void
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

function contentToText(content: Parameters<NonNullable<AppRendererProps['onMessage']>>[0]['content']) {
  return content
    .map((block) => ('text' in block && typeof block.text === 'string' ? block.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim()
}

export function McpUIRenderer({ resource, onSend }: Props) {
  const html = decodeHtml(resource)
  const sandboxUrl = useMemo(() => new URL('/mcp-ui-sandbox.html?v=app-renderer-proxy', window.location.href), [])
  const toolName = useMemo(() => resource.uri.replace(/^ui:\/\//, '') || 'agent-ui', [resource.uri])

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
        html={html}
        toolName={toolName}
        sandbox={{
          url: sandboxUrl,
          permissions: 'allow-scripts allow-same-origin allow-forms allow-popups',
        }}
        hostInfo={{ name: 'Agentik', version: '1.0.0' }}
        hostCapabilities={{
          openLinks: {},
          message: { text: {} },
          logging: {},
        }}
        onMessage={async ({ content }) => {
          const message = contentToText(content)
          if (!message || !onSend) return { isError: true }
          onSend(message)
          return {}
        }}
        onOpenLink={async ({ url }) => {
          window.open(url, '_blank', 'noopener,noreferrer')
          return {}
        }}
      />
    </div>
  )
}
