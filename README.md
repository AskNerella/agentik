# A2A Playground

A modern, developer-friendly UI for testing and debugging **Agent-to-Agent (A2A)** compatible agents.

## Features

- **Configure** agent endpoints with bearer, OAuth 2.0 access-token, and custom-header authorization
- **Fetch & validate** Agent Cards against A2A 0.3.0 compliance rules
- **Chat** with agents — supports both streaming and non-streaming modes
- **Streaming UI** — shows a "Thinking..." state and appends tokens progressively, similar to Claude / ChatGPT
- **Trace viewer** — inspect request payloads, responses, status, and time taken for each interaction

## Tech Stack

- React 19 + TypeScript
- Vite
- Lucide React (icons)
- Node.js proxy API for CORS-safe A2A calls

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

`npm run dev` starts both the Vite UI and the separate `../a2a-proxy` Node.js proxy on port `8089`.

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
