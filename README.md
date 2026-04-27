# A2A Playground

A modern, developer-friendly UI for testing and debugging **Agent-to-Agent (A2A)** compatible agents.

## Features

- **Configure** agent endpoints with custom headers and authorization
- **Fetch & validate** Agent Cards against A2A 0.3.0 compliance rules
- **Chat** with agents — supports both streaming and non-streaming modes
- **Streaming UI** — shows a "Thinking..." state and appends tokens progressively, similar to Claude / ChatGPT
- **Trace viewer** — inspect request payloads, responses, status, and time taken for each interaction

## Tech Stack

- React 19 + TypeScript
- Vite
- Lucide React (icons)
- Client-only — no backend required

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for Production

```bash
npm run build
npm run preview
```

## Project Structure

```
src/
  components/    # UI components (ConfigPanel, ChatWindow, TracePanel, etc.)
  hooks/         # Custom React hooks (useAgent, useChat, useTrace)
  services/      # A2A API client (fetchAgentCard, sendMessage, streamMessage)
  types/         # TypeScript types (AgentCard, MessageRequest, TraceLog, etc.)
  utils/         # Validation and helpers
```

