import type { ReactNode } from 'react'

type Props = {
  content: string
}

function formatInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>
    }

    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index}>{part.slice(1, -1)}</code>
    }

    return part
  })
}

export function MarkdownText({ content }: Props) {
  const lines = content.split('\n')
  const blocks: ReactNode[] = []
  let listItems: string[] = []

  const flushList = () => {
    if (listItems.length === 0) return
    blocks.push(
      <ul key={`list-${blocks.length}`}>
        {listItems.map((item, index) => (
          <li key={index}>{formatInline(item)}</li>
        ))}
      </ul>,
    )
    listItems = []
  }

  lines.forEach((line, index) => {
    const trimmed = line.trim()

    if (!trimmed) {
      flushList()
      return
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      listItems.push(trimmed.slice(2))
      return
    }

    flushList()

    if (trimmed.startsWith('### ')) {
      blocks.push(<h4 key={index}>{formatInline(trimmed.slice(4))}</h4>)
      return
    }

    if (trimmed.startsWith('## ')) {
      blocks.push(<h3 key={index}>{formatInline(trimmed.slice(3))}</h3>)
      return
    }

    if (trimmed.startsWith('# ')) {
      blocks.push(<h2 key={index}>{formatInline(trimmed.slice(2))}</h2>)
      return
    }

    blocks.push(<p key={index}>{formatInline(trimmed)}</p>)
  })

  flushList()

  return <div className="markdown-text">{blocks}</div>
}
