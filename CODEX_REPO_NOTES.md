# Codex Repo Notes

## Overview

This repo is a small npm workspace monorepo for a support ticket application.
It has two main workspaces:

- `apps/api`: Express, TypeScript, Postgres API.
- `apps/web`: React, Vite, TypeScript frontend.

The browser talks to the Vite dev server on port `4001`. In development, Vite
proxies `/api/*` and `/bootstrap` requests to the Express API on port `4000`.
The API persists data in Postgres, exposed locally on port `5544` by Docker
Compose.

## Main Structure

- `package.json`: root workspace scripts for DB, dev, test, typecheck, and lint.
- `docker-compose.yml`: local Postgres 16 service.
- `architecture.md`: detailed architecture reference.
- `apps/api/src/app.ts`: Express app assembly and route mounting.
- `apps/api/src/index.ts`: API server startup and shutdown.
- `apps/api/src/db.ts`: Postgres pool, query helper, and transaction helper.
- `apps/api/src/routes`: REST route handlers.
- `apps/api/src/domain`: small domain modules for ticket status, SLA, and audit.
- `apps/api/src/schemas`: Zod request validation schemas.
- `apps/api/migrations`: SQL schema.
- `apps/api/seed`: deterministic demo seed data.
- `apps/api/tests`: API integration and domain tests.
- `apps/web/src/App.tsx`: React app bootstrap and routes.
- `apps/web/src/api.ts`: fetch wrapper that attaches `X-User-Id`.
- `apps/web/src/pages`: route-level UI for tickets, dashboard, new ticket, detail.
- `apps/web/src/components`: reusable ticket UI pieces.
- `apps/web/src/domain`: frontend ticket status helper.

## How To Run

Prerequisites:

- Node.js 20+
- Docker Desktop or another Docker runtime

Typical local setup:

```bash
npm install
npm run db:up
npm run db:reset
npm run dev
```

Important ports:

- API: `http://localhost:4000`
- Web: `http://localhost:4001`
- Postgres: `localhost:5544`

Useful targeted commands:

```bash
npm -w apps/api run dev
npm -w apps/web run dev
npm -w apps/api run db:reset
npm run test
npm run typecheck
npm run lint
```

## Database And Seed Data

`docker-compose.yml` starts a Postgres 16 container named `ticket-app-pg`.
The default compose credentials are:

- user: `ticket`
- password: `ticket`
- database: `ticket_app`

`npm run db:reset` delegates to the API workspace, drops/recreates the public
schema through `apps/api/scripts/migrate.ts`, then loads deterministic seed
data through `apps/api/seed/seed.ts`.

The schema includes:

- `users`
- `tickets`
- `comments`
- `tags`
- `ticket_tags`
- `audit_log`

## Auth And Persona Model

The app uses a demo persona model rather than full authentication.

The frontend stores a selected persona ID in `personaStore`. `apiFetch()` reads
that ID and attaches it as the `X-User-Id` header. The API `persona` middleware
looks up that user and sets `req.user`. Routes that require a user apply
`requirePersona`, returning `401 UNAUTHENTICATED` if the header is missing,
malformed, or references no known user.

## API Shape

The Express app mounts:

- `GET /health`
- `GET /bootstrap`
- `GET /api/users`
- `GET /api/tags`
- ticket routes under `/api/tickets`
- comment routes under `/api/tickets/:id/comments`
- dashboard route under `/api/dashboard`

Most application behavior is behind `/api/tickets` and requires `X-User-Id`.

## Ticket Behavior

Backend ticket behavior is primarily implemented in
`apps/api/src/routes/tickets.ts`.

`GET /api/tickets`:

- Requires a persona.
- Accepts filters for `status`, `priority`, `assignee`, `tag`, and `q`.
- Builds parameterized SQL.
- Returns tickets ordered by `created_at DESC`.
- Adds tags, comment counts, and computed SLA fields to each ticket.

`POST /api/tickets`:

- Validates input with `createTicketSchema`.
- Requires `title` and `priority`.
- Defaults `description` to `''`, `status` to `open`, assignee to `null`, and
  tags to `[]`.
- Validates assignee and tag IDs.
- Inserts the ticket and ticket-tag rows inside a transaction.
- Writes a `created` audit entry.
- Returns the created ticket with SLA fields.

`GET /api/tickets/:id`:

- Loads ticket detail, reporter name, assignee name, tags, comments, and audit
  log.
- Adds SLA fields before returning.

`PATCH /api/tickets/:id`:

- Validates input with `updateTicketSchema`.
- Supports title, description, priority, status, assignee, and full tag list
  updates.
- Enforces status transitions when the requested status differs from current
  status.
- Sets `resolved_at = now()` when moving to `resolved`.
- Clears `resolved_at` when moving back to a non-resolved/non-closed status.
- Replaces ticket tags when `tags` is provided.
- Writes audit entries for changed status, priority, and assignee.

`DELETE /api/tickets/:id`:

- Deletes the ticket.
- Related comments, tag joins, and audit rows cascade by DB constraints.

Tag association endpoints:

- `POST /api/tickets/:id/tags`
- `DELETE /api/tickets/:id/tags/:tagId`

Comment behavior is implemented in `apps/api/src/routes/comments.ts`:

- `GET /api/tickets/:id/comments`
- `POST /api/tickets/:id/comments`

## Ticket Domain Modules

`apps/api/src/domain/ticketStatus.ts` defines the backend status state machine:

- `open -> in_progress`
- `in_progress -> resolved`
- `resolved -> closed`
- `resolved -> in_progress`
- `closed` has no outgoing transitions

The helper rejects same-status transitions, but the API treats same-status PATCH
requests as no-ops because it only validates transitions when the requested
status differs from the current status.

`apps/api/src/domain/sla.ts` defines SLA targets:

- `urgent`: 4 hours
- `high`: 8 hours
- `medium`: 24 hours
- `low`: 72 hours

SLA is computed from `created_at` to `resolved_at` for resolved tickets, or from
`created_at` to current time for unresolved tickets.

`apps/api/src/domain/audit.ts` writes audit rows for:

- `created`
- `status_changed`
- `priority_changed`
- `assignee_changed`

## Frontend Ticket Flow

`apps/web/src/App.tsx` fetches bootstrap data, seeds a default persona if none is
selected, renders the header, and defines routes:

- `/`: `TicketsPage`
- `/dashboard`: `DashboardPage`
- `/tickets/new`: `NewTicketPage`
- `/tickets/:id`: `TicketDetailPage`

`TicketsPage`:

- Reads filter state from the URL query string.
- Syncs filter changes back to the URL.
- Fetches `/api/tickets`.
- Renders filters and `TicketList`.

`NewTicketPage`:

- Fetches users and tags for form controls.
- Performs basic client validation for title and priority.
- Posts to `/api/tickets`.
- Navigates to the created ticket detail page.

`TicketDetailPage`:

- Fetches `/api/tickets/:id`.
- Allows editing title, description, priority, and assignee.
- Allows status changes through `StatusBadge`.
- Updates local state after assignee, tag, and comment changes.

Shared UI components include:

- `TicketList`
- `TicketRow`
- `Filters`
- `StatusBadge`
- `PriorityBadge`
- `SlaBadge`
- `TagChips`
- `AssigneePicker`
- `CommentThread`

## Tests

Root `npm run test` runs tests across both workspaces.

API tests:

- Config: `apps/api/vitest.config.ts`
- Environment: Node
- Include pattern: `tests/**/*.test.ts`
- File parallelism disabled
- Use Supertest against `createApp()`
- Use the real Postgres pool
- Expect the database to already be migrated and seeded

If API tests fail with a seed error, run:

```bash
npm run db:reset
```

Web tests:

- Config: `apps/web/vitest.config.ts`
- Environment: jsdom
- Setup: `apps/web/vitest.setup.ts`
- Include pattern: `src/**/*.{test,spec}.{ts,tsx}`
- Use React Testing Library and jest-dom

Notable ticket-related API tests include:

- `tickets.test.ts`
- `ticketsCreate.test.ts`
- `ticketsDetail.test.ts`
- `ticketsStatusTransitions.test.ts`
- `ticketsFilters.test.ts`
- `assigneesAndTags.test.ts`
- `comments.test.ts`
- `audit.test.ts`
- `sla.test.ts`
- `statusMachine.test.ts`

Notable ticket-related web tests include:

- `TicketsPage.test.tsx`
- `TicketDetailPage.test.tsx`
- `NewTicketPage.test.tsx`
- component tests for filters, ticket rows/lists, badges, assignee picker, tags,
  and comments
