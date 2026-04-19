# Warden

MCP Server with SQLite foundation, built as a pnpm monorepo.

## Architecture

```
warden/
  server/      — Node 20 + TypeScript MCP server process
  shared/      — Cross-package TypeScript types and utilities
  dashboard/   — Next.js admin dashboard (scaffold, filled by F6)
```

## Packages

- **@warden/server** — The MCP server. Handles tool registration, request routing, and SQLite persistence.
- **@warden/shared** — Shared TypeScript types, constants, and utilities consumed by both server and dashboard.
- **@warden/dashboard** — Admin dashboard for monitoring and managing the MCP server (empty scaffold).

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm

### Install

```bash
pnpm install
```

### Scripts

| Command            | Description                        |
| ------------------ | ---------------------------------- |
| `pnpm dev`         | Start the server in dev mode       |
| `pnpm build`       | Build all packages                 |
| `pnpm typecheck`   | Type-check all packages            |
| `pnpm lint`        | Lint all packages                  |
| `pnpm test`        | Run tests across all packages      |
