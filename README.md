# Agentik Playground

A Tauri desktop app for testing and debugging **Agent-to-Agent (A2A)** agents and **Model Context Protocol (MCP)** servers.

## Features

- **Configure** agent endpoints with bearer, OAuth 2.0 access-token, and custom-header authorization
- **Fetch & validate** Agent Cards against A2A 0.3.0 compliance rules
- **Chat** with agents — supports both streaming and non-streaming modes
- **Streaming UI** — shows a "Thinking..." state and appends tokens progressively, similar to Claude / ChatGPT
- **Trace viewer** — inspect request payloads, responses, status, and time taken for each interaction

## Tech Stack

- React 19 + TypeScript
- Vite
- Tauri 2
- Tauri HTTP plugin (native A2A/MCP requests without browser CORS restrictions)
- Lucide React (icons)

## Getting Started

### Prerequisites

- Node.js 18+
- Rust 1.77.2+ and the [Tauri system prerequisites](https://v2.tauri.app/start/prerequisites/)
- npm

### Install & Run

```bash
npm install
npm run dev
```

`npm run dev` starts Vite and opens the Tauri desktop window. A separate proxy process is not required; outbound HTTP is handled by Tauri's native HTTP plugin.

To run only the browser UI, use `npm run dev:ui`. Browser mode uses normal browser networking, so target A2A and MCP servers must allow CORS from `http://localhost:5173`.

### Build for Production

```bash
npm run build
```

The platform installer or application bundle is written below `src-tauri/target/release/bundle/`.

## Project Structure

```
src/
  components/    # UI components (ConfigPanel, ChatWindow, TracePanel, etc.)
  hooks/         # Custom React hooks (useAgent, useChat, useTrace)
  services/      # A2A API client (fetchAgentCard, sendMessage, streamMessage)
  types/         # TypeScript types (AgentCard, MessageRequest, TraceLog, etc.)
  utils/         # Validation and helpers
src-tauri/        # Tauri configuration, capabilities, and Rust entry point
```
