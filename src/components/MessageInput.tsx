import { Send, SquarePen } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'

type Props = {
  disabled: boolean
  streaming: boolean
  onStreamingChange: (enabled: boolean) => void
  onSend: (message: string) => void
}

export function MessageInput({ disabled, streaming, onStreamingChange, onSend }: Props) {
  const [message, setMessage] = useState('')

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!message.trim()) return
    onSend(message)
    setMessage('')
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (!message.trim() || disabled) return
      onSend(message)
      setMessage('')
    }
  }

  return (
    <form className="message-input" onSubmit={handleSubmit}>
      <div className="message-toolbar">
        <div className="input-label">
          <SquarePen size={16} />
          <span>Message</span>
        </div>
        <label className="switch">
          <input
            type="checkbox"
            checked={streaming}
            onChange={(event) => onStreamingChange(event.target.checked)}
          />
          <span>Streaming</span>
        </label>
      </div>
      <div className="composer">
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask the agent to do something..."
          rows={3}
          disabled={disabled}
        />
        <button className="send-button" type="submit" disabled={disabled || !message.trim()} aria-label="Send message">
          <Send size={18} />
        </button>
      </div>
    </form>
  )
}
