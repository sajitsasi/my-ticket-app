# AGENTS.md

Working notes and instructions for AI agents contributing to this repository.

## Project Overview

This is a full-stack support ticket application built as an npm workspace monorepo.

- `apps/web`: React + Vite + TypeScript frontend.
- `apps/api`: Express + TypeScript backend.
- `docker-compose.yml`: Local Postgres database.
- `apps/api/migrations`: SQL schema migrations.
- `apps/api/seed`: Demo seed data.

## Local Setup

Use Node.js 20+ and Docker Desktop.

```bash
npm install
npm run db:up
npm run db:reset
npm run dev
```

Expected local services:

- API: `http://localhost:4000`
- Web: `http://localhost:4001`
- Postgres: `localhost:5544`

The local `.env` should match `docker-compose.yml` for database credentials:

```text
PGUSER=ticket
PGPASSWORD=ticket
```

## Working style:

1. Inspect repo structure
2. Read README.md, CODEX_REPO_NOTES.md, and architecture.md if relevant
3. Identify the smallest safe change
4. Explain which files are likely to change
5. Ask clarifying questions when requirements are ambiguous

## Common Commands

```bash
npm run dev
npm run test
npm run typecheck
npm run lint
npm run db:up
npm run db:down
npm run db:reset
```

General Validation commands:

```bash
npm run test
npm run typecheck
npm run lint
```

Targeted Validation commands:

```bash
npm -w apps/api run test
npm -w apps/web run test
npm -w apps/api run typecheck
npm -w apps/web run typecheck
```

## Architecture Notes

The frontend calls relative API paths such as `/api/tickets`. Vite proxies `/api` and `/bootstrap` to the backend during local development.

Ticket list flow:

1. `apps/web/src/pages/TicketsPage.tsx` owns filter state and builds the ticket list URL.
2. `apps/web/src/api.ts` sends requests and injects the `X-User-Id` persona header.
3. `apps/api/src/app.ts` mounts `ticketsRouter` at `/api/tickets`.
4. `apps/api/src/routes/tickets.ts` parses filters, builds SQL, queries Postgres, adds tags/comment counts/SLA fields, and returns JSON.

Ticket creation flow:

1. `apps/web/src/pages/NewTicketPage.tsx` validates the form client-side and posts to `/api/tickets`.
2. `apps/api/src/routes/tickets.ts` validates the request with `createTicketSchema`.
3. The API verifies assignee/tag IDs, inserts the ticket, inserts tag links, writes an audit log entry, and returns the created ticket.

## Validation

- Run validation and targeted validation commands
- API ticket schemas live in `apps/api/src/schemas/tickets.ts`.
- DB constraints live in `apps/api/migrations/001_init.sql`.
- Frontend form validation for ticket creation lives in `apps/web/src/pages/NewTicketPage.tsx`.

## Tests

- API tests: `apps/api/tests/**/*.test.ts`
- Web tests: `apps/web/src/**/*.test.tsx`
- API test config: `apps/api/vitest.config.ts`
- Web test config: `apps/web/vitest.config.ts`

Important focused tests:

- Filtering: `apps/api/tests/ticketsFilters.test.ts`
- Ticket creation: `apps/api/tests/ticketsCreate.test.ts`
- Ticket list UI: `apps/web/src/pages/TicketsPage.test.tsx`
- New ticket UI: `apps/web/src/pages/NewTicketPage.test.tsx`

## Agent Working Rules

- Explain current behavior
- Identify the smallest safe implementation plan
- List files likely to change
- Call out assumptions and risks
- Wait for confirmation if the change is ambiguous, destructive or broad
- Prefer small, scoped changes.
- Do not commit secrets or local environment files.
- Keep `.env` ignored.
- Do not commit `node_modules`, build outputs, coverage, or local demo notes.
- Run relevant tests after behavior changes.
- For database-dependent API work, ensure Postgres is running and seeded with `npm run db:reset`.
- Preserve the existing project structure unless there is a clear reason to change it.
- Changes should not be pushed directly to main.

## Definition of Done

A task is complete only when:
1. The requested behavior is implemented with the smallest reasonable change.
2. The diff has been inspected.
3. Relevant tests have been run, or skipped with a clear explanation.
4. Typecheck has been run for touched workspaces when practical.
5. Lint has been run when practical.
6. UI changes have been manually verified when practical.
7. The final response summarizes:
   - files changed
   - behavior changed
   - validation performed
   - risks or assumptions
   - suggested follow-up
