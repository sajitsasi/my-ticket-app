# Ticket App — Claude's Notes

## What This Is

A support ticket management system. Full-stack monorepo: Express/PostgreSQL API + React/Vite SPA.

---

## Repo Layout

```
ticket-app/
├── apps/api/          # Express backend, port 3000
├── apps/web/          # React frontend, port 5173
├── docker-compose.yml # Postgres container
└── package.json       # npm workspaces root
```

---

## How to Run

```bash
npm run db:up          # start Postgres via Docker
npm run db:reset       # run migrations + seed (run from root; targets apps/api)
npm run dev            # concurrently starts api + web
```

Config lives in `.env` (copy from `.env.example`).

---

## API Structure (`apps/api/src/`)

| File | Role |
|------|------|
| `app.ts` | Express factory — CORS, middleware, router mounts |
| `db.ts` | pg pool, `query()`, `withTransaction()` |
| `middleware/persona.ts` | Auth: reads `X-User-Id` header → `req.user` |
| `middleware/errorHandler.ts` | `ApiError` class, 404/error middleware |
| `routes/tickets.ts` | Full ticket CRUD + tag association endpoints |
| `routes/comments.ts` | `POST /api/tickets/:id/comments` |
| `routes/dashboard.ts` | Aggregated stats |
| `routes/users.ts`, `routes/tags.ts` | Listing endpoints |
| `routes/bootstrap.ts` | Dev seed/reset helper |
| `domain/ticketStatus.ts` | Status state machine + transition guard |
| `domain/sla.ts` | SLA target hours and `computeSla()` |
| `domain/audit.ts` | `writeAudit()` — inserts into `audit_log` |
| `migrations/001_init.sql` | Full schema DDL (single migration) |
| `seed/seed.ts` | Sample data |

---

## Web Structure (`apps/web/src/`)

| File | Role |
|------|------|
| `api.ts` | Typed fetch wrappers for every API endpoint |
| `personaStore.ts` | Global active-user store (drives `X-User-Id` header) |
| `pages/TicketsPage.tsx` | Ticket list + filter UI |
| `pages/TicketDetailPage.tsx` | Single ticket, comments, audit log |
| `pages/NewTicketPage.tsx` | Create ticket form |
| `pages/DashboardPage.tsx` | Stats/charts |
| `components/` | `StatusBadge`, `SlaBadge`, `AssigneePicker`, `TagChips`, `CommentThread`, `Filters`, `TicketRow`, `TicketList`, `Header` |
| `domain/ticketStatus.ts` | Client-side copy of the status machine |

---

## Database Schema (key tables)

- `users` — id, name, email, role (`agent` | `requester`)
- `tickets` — id, title, description, status, priority, reporter_id, assignee_id, created_at, updated_at, resolved_at
- `comments` — id, ticket_id, author_id, body, created_at
- `tags` / `ticket_tags` — many-to-many tag association
- `audit_log` — id, ticket_id, actor_id, action, from_value, to_value, created_at

---

## Ticket Behavior

### Status State Machine (`domain/ticketStatus.ts`)

```
open → in_progress → resolved → closed
                  ↑____________↓   (resolved can reopen to in_progress)
```

- Enforced on `PATCH /api/tickets/:id` — invalid transitions → HTTP 422 `INVALID_TRANSITION`
- `resolved_at` is stamped when status becomes `resolved`, cleared if reopened

### SLA (`domain/sla.ts`)

| Priority | Target |
|----------|--------|
| urgent   | 4 h    |
| high     | 8 h    |
| medium   | 24 h   |
| low      | 72 h   |

`computeSla(priority, created_at, resolved_at)` returns `sla_target_hours`, `sla_remaining_seconds`, `sla_breached`. Appended to every ticket response by `addSlaFields()`.

### Audit Log (`domain/audit.ts`)

Written inside DB transactions on:
- `created` — ticket creation
- `status_changed` — status transition
- `priority_changed` — priority edit
- `assignee_changed` — assignee change

Returned as `audit_log[]` on the detail endpoint.

### Auth / Persona

No real auth. Every request must include `X-User-Id: <uuid>`. The middleware looks it up in `users` and attaches it to `req.user`. Missing/unknown → 401. The web UI has a persona switcher in the header that injects this header.

---

## Tests

### API (`apps/api/tests/`)

- Vitest, Node environment, **real Postgres** (no mocks)
- `fileParallelism: false` — prevents race conditions on the shared DB
- Tests reset/re-seed data themselves before assertions

### Web (`apps/web/src/**/*.test.tsx`)

- Vitest + jsdom + `@testing-library/react`
- API layer is mocked; `vitest.setup.ts` configures globals
- Run all: `npm test` from root; single workspace: `npm -w apps/api test`
