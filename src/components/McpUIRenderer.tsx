import { useRef } from 'react'
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

export function McpUIRenderer({ resource }: Props) {
  const html = decodeHtml(resource)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const handleLoad = () => {
    const iframe = iframeRef.current
    if (!iframe || !iframe.contentDocument) return
    const doc = iframe.contentDocument
    const body = doc.body
    body.style.overflow = 'hidden'
    body.style.margin = '0'
    const root = doc.documentElement
    root.style.width = '100%'
    root.style.boxSizing = 'border-box'

    const updateHeight = () => {
      const height = Math.max(body.scrollHeight, root.scrollHeight)
      if (height > 0) iframe.style.height = `${height}px`
    }

    updateHeight()
    // Re-measure after transitions/animations settle
    setTimeout(updateHeight, 100)
    setTimeout(updateHeight, 400)

    // Keep in sync if content changes (carousel navigation etc.)
    const observer = new (iframe.contentWindow as Window & typeof globalThis).ResizeObserver(updateHeight)
    observer.observe(body)
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
      <iframe
        ref={iframeRef}
        srcDoc={html}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        className="mcp-message-iframe"
        title="Agent UI"
        scrolling="no"
        onLoad={handleLoad}
      />
    </div>
  )
}
