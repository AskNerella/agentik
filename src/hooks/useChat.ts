import { useCallback, useState } from 'react'
import { createJsonRpcMessagePayload, sendMessage, streamMessage } from '../services/a2aClient'
import type { ChatMessage, StreamChunk, TraceLog } from '../types/a2a'

type AppendTrace = (trace: Omit<TraceLog, 'id' | 'timestamp'>) => void

export function useChat(appendTrace: AppendTrace, initialMessages: ChatMessage[] = []) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sendChatMessage = useCallback(
    async (
      endpoint: string,
      message: string,
      stream: boolean,
      contextId: string,
      headers: Record<string, string>,
    ) => {
      const cleanMessage = message.trim()
      if (!cleanMessage || loading) return

      setLoading(true)
      setError(null)

      const payload = createJsonRpcMessagePayload({ message: cleanMessage, stream }, contextId)
      const startedAt = performance.now()
      const requestTimestamp = new Date().toISOString()
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: cleanMessage,
        createdAt: new Date().toISOString(),
      }
      const agentMessageId = crypto.randomUUID()

      setMessages((current) => [
        ...current,
        userMessage,
        {
          id: agentMessageId,
          role: 'agent',
          content: '',
          isStreaming: stream,
          statusUpdates: stream ? ['Waiting for agent response...'] : undefined,
          trackerCollapsed: false,
          artifacts: [],
          createdAt: new Date().toISOString(),
        },
      ])

      try {
        appendTrace({
          label: cleanMessage,
          kind: 'request',
          requestId: payload.id,
          messageId: userMessage.id,
          contextId,
          displayText: cleanMessage,
          requestTimestamp,
          request: { method: 'POST', endpoint, headers, payload, timestamp: requestTimestamp },
          response: null,
          status: 'ok',
          durationMs: 0,
        })

        if (stream) {
          const chunks: StreamChunk[] = []

          await streamMessage(
            endpoint,
            payload,
            (chunk) => {
              chunks.push(chunk)
              if (chunk.type !== 'done') {
                appendTrace({
                  label: chunk.type === 'error' ? 'Stream error event' : 'Stream event',
                  kind: 'stream',
                  requestId: payload.id,
                  messageId: userMessage.id,
                  contextId,
                  displayText: chunk.content || cleanMessage,
                  requestTimestamp,
                  request: { method: 'POST', endpoint, headers, payload },
                  response: chunk.raw ?? chunk,
                  status: chunk.type === 'error' ? 'error' : 'ok',
                  durationMs: Math.round(performance.now() - startedAt),
                })
              }

              if (chunk.type === 'status') {
                setMessages((current) =>
                  current.map((item) =>
                    item.id === agentMessageId
                      ? {
                          ...item,
                          statusUpdates: [...(item.statusUpdates ?? []), chunk.content ?? 'Agent updated status.'],
                          artifacts: chunk.artifact ? [...(item.artifacts ?? []), chunk.artifact] : item.artifacts,
                        }
                      : item,
                  ),
                )
              }

              if (chunk.type === 'token') {
                setMessages((current) =>
                  current.map((item) =>
                    item.id === agentMessageId
                      ? {
                          ...item,
                          content:
                            chunk.final && !chunk.artifact && item.content
                              ? item.content
                              : chunk.final
                                ? chunk.content ?? item.content
                                : `${item.content}${chunk.content ?? ''}`,
                          artifacts: chunk.artifact ? [...(item.artifacts ?? []), chunk.artifact] : item.artifacts,
                          statusUpdates:
                            chunk.final || !chunk.content || chunk.artifact
                              ? item.statusUpdates
                              : [...(item.statusUpdates ?? []), chunk.content],
                          trackerCollapsed: chunk.final ? true : item.trackerCollapsed,
                        }
                      : item,
                  ),
                )
              }

              if (chunk.type === 'error') {
                setMessages((current) =>
                  current.map((item) =>
                    item.id === agentMessageId
                      ? {
                          ...item,
                          content: chunk.content || 'The agent returned a streaming error.',
                          status: 'error',
                          isStreaming: false,
                          trackerCollapsed: true,
                        }
                      : item,
                  ),
                )
              }
            },
            headers,
          )

          setMessages((current) =>
            current.map((item) =>
              item.id === agentMessageId
                ? {
                    ...item,
                    content: item.content || 'Stream completed without a displayable message.',
                    isStreaming: false,
                    status: 'ok',
                    trackerCollapsed: true,
                  }
                : item,
            ),
          )
          appendTrace({
            label: 'Stream message',
            kind: 'response',
            requestId: payload.id,
            messageId: userMessage.id,
            contextId,
            displayText: cleanMessage,
            requestTimestamp,
            request: { method: 'POST', endpoint, headers, payload },
            response: { chunks },
            status: 'ok',
            durationMs: Math.round(performance.now() - startedAt),
          })
        } else {
          const response = await sendMessage(endpoint, payload, headers)
          setMessages((current) =>
            current.map((item) =>
              item.id === agentMessageId
                ? {
                    ...item,
                    content: response.reply || JSON.stringify(response),
                    status: response.status,
                    isStreaming: false,
                    trackerCollapsed: true,
                    artifacts: response.artifacts ?? item.artifacts,
                  }
                : item,
            ),
          )
          appendTrace({
            label: 'Send message',
            kind: 'response',
            requestId: payload.id,
            messageId: userMessage.id,
            contextId,
            displayText: cleanMessage,
            requestTimestamp,
            request: { method: 'POST', endpoint, headers, payload },
            response,
            status: response.status === 'ok' ? 'ok' : 'error',
            durationMs: Math.round(performance.now() - startedAt),
          })
        }
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'Message request failed'
        setError(message)
        setMessages((current) =>
          current.map((item) =>
            item.id === agentMessageId
              ? { ...item, content: message, status: 'error', isStreaming: false }
              : item,
          ),
        )
        appendTrace({
          label: stream ? 'Stream message' : 'Send message',
          kind: 'response',
          requestId: payload.id,
          messageId: userMessage.id,
          contextId,
          displayText: cleanMessage,
          requestTimestamp,
          request: { method: 'POST', endpoint, headers, payload },
          response: { error: message },
          status: 'error',
          durationMs: Math.round(performance.now() - startedAt),
        })
      } finally {
        setLoading(false)
      }
    },
    [appendTrace, loading],
  )

  const clearMessages = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

  return { messages, setMessages, loading, error, sendChatMessage, clearMessages }
}
