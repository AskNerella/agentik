import type { ReactNode } from 'react'

type Props = {
  content: string
}

function formatInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|\(?https?:\/\/[^\s)]+(?:\))?)/g)

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>
    }

    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index}>{part.slice(1, -1)}</code>
    }

    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (linkMatch) {
      return (
        <a key={index} href={linkMatch[2]} target="_blank" rel="noreferrer">
          {linkMatch[1]}
        </a>
      )
    }

    const bareUrlMatch = part.match(/^\(?((?:https?:\/\/)[^\s)]+)\)?$/)
    if (bareUrlMatch) {
      return (
        <a key={index} href={bareUrlMatch[1]} target="_blank" rel="noreferrer">
          {bareUrlMatch[1]}
        </a>
      )
    }

    return part
  })
}

export function MarkdownText({ content }: Props) {
  const lines = content.split('\n')
  const blocks: ReactNode[] = []
  let listItems: { text: string; ordered: boolean }[] = []
  let codeLines: string[] = []
  let inCodeBlock = false

  const flushList = () => {
    if (listItems.length === 0) return
    const ordered = listItems[0]?.ordered
    const ListTag = ordered ? 'ol' : 'ul'
    blocks.push(
      <ListTag key={`list-${blocks.length}`}>
        {listItems.map((item, index) => (
          <li key={index}>{formatInline(item.text)}</li>
        ))}
      </ListTag>,
    )
    listItems = []
  }

  const flushCode = () => {
    if (codeLines.length === 0) return
    blocks.push(
      <pre key={`code-${blocks.length}`}>
        <code>{codeLines.join('\n')}</code>
      </pre>,
    )
    codeLines = []
  }

  lines.forEach((line, index) => {
    const trimmed = line.trim()

    if (trimmed.startsWith('```')) {
      if (inCodeBlock) flushCode()
      inCodeBlock = !inCodeBlock
      return
    }

    if (inCodeBlock) {
      codeLines.push(line)
      return
    }

    if (!trimmed) {
      flushList()
      return
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      listItems.push({ text: trimmed.slice(2), ordered: false })
      return
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/)
    if (orderedMatch) {
      listItems.push({ text: orderedMatch[1], ordered: true })
      return
    }

    // Support wrapped list item content on the next indented line.
    if (listItems.length > 0 && /^\s+/.test(line)) {
      const last = listItems[listItems.length - 1]
      last.text = `${last.text}\n${trimmed}`
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

    if (trimmed.startsWith('> ')) {
      blocks.push(<blockquote key={index}>{formatInline(trimmed.slice(2))}</blockquote>)
      return
    }

    blocks.push(<p key={index}>{formatInline(trimmed)}</p>)
  })

  flushList()
  flushCode()

  return <div className="markdown-text">{blocks}</div>
}
