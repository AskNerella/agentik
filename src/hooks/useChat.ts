import { useCallback, useState } from 'react'
import { createJsonRpcMessagePayload, sendMessage, streamMessage } from '../services/a2aClient'
import type { ChatMessage, StreamChunk, TraceLog } from '../types/a2a'

type AppendTrace = (trace: Omit<TraceLog, 'id' | 'timestamp'>) => void
type UpdateMessages = (contextId: string, updater: (messages: ChatMessage[]) => ChatMessage[]) => void

export function useChat(
  appendTrace: AppendTrace,
  initialMessages: ChatMessage[] = [],
  activeContextId = '',
  updateSessionMessages?: UpdateMessages,
) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [loadingContexts, setLoadingContexts] = useState<Set<string>>(new Set())
  const [errorsByContext, setErrorsByContext] = useState<Record<string, string | null>>({})

  const applyMessages = useCallback(
    (contextId: string, updater: (messages: ChatMessage[]) => ChatMessage[]) => {
      if (contextId === activeContextId) {
        setMessages(updater)
      }
      updateSessionMessages?.(contextId, updater)
    },
    [activeContextId, updateSessionMessages],
  )

  const sendChatMessage = useCallback(
    async (
      endpoint: string,
      message: string,
      stream: boolean,
      contextId: string,
      headers: Record<string, string>,
    ) => {
      const cleanMessage = message.trim()
      if (!cleanMessage || loadingContexts.has(contextId)) return

      setLoadingContexts((current) => new Set(current).add(contextId))
      setErrorsByContext((current) => ({ ...current, [contextId]: null }))

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

      applyMessages(contextId, (current) => [
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
                applyMessages(contextId, (current) =>
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
                applyMessages(contextId, (current) =>
                  current.map((item) =>
                    item.id === agentMessageId
                      ? {
                          ...item,
                          content:
                            chunk.final && !chunk.artifact && item.content
                              ? item.content
                              : chunk.final
                                ? chunk.content ?? item.content
                                : item.content,
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
                applyMessages(contextId, (current) =>
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

          applyMessages(contextId, (current) =>
            current.map((item) =>
              item.id === agentMessageId
                ? {
                    ...item,
                    content: item.content || 'Stream completed without a displayable message.',
                    isStreaming: false,
                    status: item.status === 'error' ? 'error' : 'ok',
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
            status: chunks.some((chunk) => chunk.type === 'error') ? 'error' : 'ok',
            durationMs: Math.round(performance.now() - startedAt),
          })
        } else {
          const response = await sendMessage(endpoint, payload, headers)
          applyMessages(contextId, (current) =>
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
        setErrorsByContext((current) => ({ ...current, [contextId]: message }))
        applyMessages(contextId, (current) =>
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
        setLoadingContexts((current) => {
          const next = new Set(current)
          next.delete(contextId)
          return next
        })
      }
    },
    [appendTrace, applyMessages, loadingContexts],
  )

  const clearMessages = useCallback(() => {
    setMessages([])
    setErrorsByContext((current) => ({ ...current, [activeContextId]: null }))
    if (activeContextId) updateSessionMessages?.(activeContextId, () => [])
  }, [activeContextId, updateSessionMessages])

  return {
    messages,
    setMessages,
    loading: loadingContexts.has(activeContextId),
    error: errorsByContext[activeContextId] ?? null,
    sendChatMessage,
    clearMessages,
  }
}
