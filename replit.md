# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Artifacts

### PeerSavr (`artifacts/peersavr`)
- React + Vite frontend at `/` (port 18515)
- Secure peer-to-peer chat app using PeerJS
- Real login/signup with username uniqueness enforced
- Accounts stored in PostgreSQL; passwords hashed with SHA-256 + session secret
- After login, users connect to each other by username for P2P messaging

### API Server (`artifacts/api-server`)
- Express 5 server at `/api`
- Routes: `/api/auth/signup`, `/api/auth/login`, `/api/healthz`

## Database Schema

- `users` table: `id`, `username` (unique), `password_hash`, `created_at`

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
