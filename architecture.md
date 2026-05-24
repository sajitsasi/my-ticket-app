# Architecture Reference

## 1. System Overview

The support ticket app is a three-tier system: a React SPA in the browser talks to an Express REST API, which persists data in PostgreSQL. In development, Vite's dev server proxies API requests to the Express backend so both are served from the same origin.

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Request Flow                                  │
│                                                                      │
│  ┌──────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────┐ │
│  │  Browser  │────▶│  Vite Proxy  │────▶│ Express API  │────▶│ PG   │ │
│  │  (React)  │◀────│  :4001       │◀────│  :4000       │◀────│:5544 │ │
│  └──────────┘     └──────────────┘     └─────────────┘     └──────┘ │
│       │                  │                     │                     │
│       │                  │  /api/* ──────────▶ │                     │
│       │                  │  /bootstrap/* ────▶ │                     │
│       │                  │  (other) ─────────▶ Vite SPA             │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

The Vite dev server (port 4001) proxies any request whose path starts with `/api` or `/bootstrap` to the Express API (port 4000). All other paths are handled by the SPA router (React Router).

---

## 2. Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BROWSER LAYER                                  │
│                                                                             │
│  localStorage ◀──▶ personaStore ──▶ apiFetch (X-User-Id header)           │
│                                                                             │
│  ┌──── Header ────────────────────────────────────────────────────────┐    │
│  │  Persona picker (sets personaStore) │ Nav links                    │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Pages:  TicketsPage │ DashboardPage │ NewTicketPage │ TicketDetailPage     │
│                                                                             │
│  Shared components:  Filters │ TicketList/TicketRow │ PriorityBadge        │
│                      StatusBadge │ SlaBadge │ TagChips │ AssigneePicker   │
│                      CommentThread                                         │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │ fetch /api/* , /bootstrap/*
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                               API LAYER                                     │
│                                                                             │
│  Middleware stack (executed in order):                                      │
│  ┌─────────┐  ┌──────────────┐  ┌────────────┐  ┌────────────────────┐   │
│  │  CORS   │─▶│ express.json │─▶│requestLogger│─▶│     persona        │   │
│  └─────────┘  └──────────────┘  └────────────┘  └────────┬───────────┘   │
│                                                          │                │
│                                          X-User-Id header present?         │
│                                                 │  yes  │  no             │
│                                                 ▼        ▼                │
│                                          req.user set   req.user absent    │
│                                                 │        │                │
│                                        requirePersona  │  skips auth     │
│                                        (401 if absent)│                   │
│                                                      ▼                    │
│  Route handlers: ┌──────────┬──────────┬──────────┬──────────┐            │
│                  │ tickets  │ comments │ dashboard│ tags     │            │
│                  │ users    │ bootstrap│ health   │          │            │
│                  └──────────┴──────────┴──────────┴──────────┘            │
│                      │           │            │                           │
│                      ▼           ▼            ▼                           │
│  Domain modules: ┌──────────┬──────────┬──────────┐                      │
│                  │ sla.ts   │ticketStat│ audit.ts │                      │
│                  │          │   us.ts  │          │                      │
│                  └──────────┴──────────┴──────────┘                      │
│                      │                                                    │
│  Validation:     Zod schemas (tickets.ts, comments.ts)                   │
│                      │                                                    │
│  Error handling: errorHandler.ts  (ApiError → JSON, 500 fallback)        │
└──────────────────────────┬──────────────────────────────────────────────────┘
                           │ SQL via node-postgres Pool
                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATA LAYER                                     │
│                                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │  users   │  │ tickets  │  │ comments │  │   tags   │  │audit_log │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
│       │             │             │              │             │           │
│       │    ┌────────┴─────┐      │              │             │           │
│       │    │ ticket_tags  │◀─────┘              │             │           │
│       │    └──────────────┘                     │             │           │
│       │         │                               │             │           │
│       ▼         ▼                               ▼             ▼           │
│    (see ER diagram below)                                                   │
│                                                                             │
│  PostgreSQL 16 · Docker · port 5544 → container 5432                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Persona Flow

```
┌──────────────┐      ┌───────────────┐      ┌──────────────┐
│  localStorage │─────▶│ personaStore  │─────▶│   apiFetch   │
│  (key:        │◀─────│ getId/setId   │      │  (sets header│
│ ticket-app:   │  notify subscribers  │      │  X-User-Id)  │
│ persona-id)   │      └───────────────┘      └──────┬───────┘
└──────────────┘                                        │
                                                        ▼
                                               ┌──────────────────┐
                                               │ persona middleware│
                                               │ reads X-User-Id  │
                                               │ looks up user    │
                                               │ sets req.user    │
                                               └──────────────────┘
```

---

## 3. Data Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ENUMS                                          │
│                                                                             │
│  role       : 'agent' | 'requester'                                        │
│  status     : 'open' | 'in_progress' | 'resolved' | 'closed'             │
│  priority   : 'low' | 'medium' | 'high' | 'urgent'                        │
│  audit_action: 'created' | 'status_changed' | 'priority_changed'          │
│              | 'assignee_changed'                                           │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────┐
│               users                  │
├──────────────────────────────────────┤
│ id          uuid    PK DEFAULT        │
│ name        text    NOT NULL          │
│ email       text    NOT NULL UNIQUE   │
│ role        text    NOT NULL          │
│ created_at  timestamptz NOT NULL      │
└──────────────┬───────────────────────┘
               │
               │ 1
               │
      ┌────────┼──────────────────────────────┐
      │        │                              │
      ▼ *      ▼ *                            ▼ *
┌──────────────────────────────────────┐  ┌──────────────────────────────────┐
│              tickets                  │  │            comments              │
├──────────────────────────────────────┤  ├──────────────────────────────────┤
│ id           uuid   PK DEFAULT        │  │ id           uuid   PK DEFAULT   │
│ title        text   NOT NULL         │  │ ticket_id    uuid   FK→tickets   │
│ description  text   NOT NULL DEFAULT │  │ author_id    uuid   FK→users     │
│ status       text   NOT NULL         │  │ body         text   NOT NULL     │
│ priority     text   NOT NULL         │  │ created_at   timestamptz NOT NULL│
│ reporter_id  uuid   FK→users NOT NULL│  └──────────────────────────────────┘
│ assignee_id  uuid   FK→users NULL    │
│ created_at   timestamptz NOT NULL     │  ┌──────────────────────────────────┐
│ updated_at   timestamptz NOT NULL     │  │            audit_log             │
│ resolved_at  timestamptz NULL        │  ├──────────────────────────────────┤
└──────┬───────────────────────────────┘  │ id           uuid   PK DEFAULT   │
       │                                  │ ticket_id    uuid   FK→tickets   │
       │ *                                │ actor_id     uuid   FK→users     │
       │                                  │ action       text   NOT NULL     │
       │          ┌───────────────────┐   │ from_value   text   NULL         │
       │ *        │     ticket_tags   │   │ to_value     text   NULL         │
       ├─────────▶│  (junction table) │   │ created_at   timestamptz NOT NULL│
       │          ├───────────────────┤   └──────────────────────────────────┘
       │          │ ticket_id  FK→tickets │
       │          │ tag_id     FK→tags  * │
       │          │ PK (ticket_id,tag_id)│
       │          └────────┬──────────┘
       │                   │ *
       │                   │
       │                   ▼ 1
       │          ┌──────────────────┐
       │          │      tags       │
       │          ├──────────────────┤
       │          │ id    uuid  PK   │
       │          │ name  text  UNIQ │
       │          │ color text       │
       │          └──────────────────┘
       │
       └────────────────── reporter_id → users
                          assignee_id → users

   CASCADE deletes:  tickets → comments, tickets → ticket_tags,
                     tickets → audit_log,  tags → ticket_tags
```

### Indexes

| Table        | Index                      |
|--------------|----------------------------|
| tickets      | tickets_status_idx         |
| tickets      | tickets_priority_idx       |
| tickets      | tickets_assignee_idx       |
| tickets      | tickets_reporter_idx       |
| comments     | comments_ticket_idx        |
| ticket_tags  | ticket_tags_tag_idx        |
| audit_log    | audit_log_ticket_idx       |

---

## 4. API Surface

| Method | Path                        | Auth  | Description                                    |
|--------|-----------------------------|-------|------------------------------------------------|
| GET    | `/health`                   | —     | Liveness check → `{ status: "ok" }`            |
| GET    | `/bootstrap`                | —     | Users list + default persona ID for SPA init    |
| GET    | `/api/users`                | —     | List all users                                  |
| GET    | `/api/tags`                 | Yes   | List all tags                                   |
| GET    | `/api/tickets`              | Yes   | List tickets with filters (status, priority, assignee, tag, q) |
| POST   | `/api/tickets`              | Yes   | Create a ticket                                 |
| GET    | `/api/tickets/:id`          | Yes   | Get ticket detail + comments + audit log         |
| PATCH  | `/api/tickets/:id`          | Yes   | Update ticket (partial); enforces status transitions |
| DELETE | `/api/tickets/:id`          | Yes   | Delete a ticket                                 |
| POST   | `/api/tickets/:id/tags`     | Yes   | Add a tag to a ticket                           |
| DELETE | `/api/tickets/:id/tags/:tagId` | Yes | Remove a tag from a ticket                     |
| GET    | `/api/tickets/:id/comments` | Yes   | List comments for a ticket                      |
| POST   | `/api/tickets/:id/comments` | Yes   | Add a comment to a ticket                       |
| GET    | `/api/dashboard`            | Yes   | Dashboard aggregates (byStatus, byPriority, avgResolutionTime, slaBreachCount, topAssignees) |

**Auth** = requires valid `X-User-Id` header referencing an existing user; **—** = no auth required.

### Query-string filters for `GET /api/tickets`

| Param    | Type   | Example                             |
|----------|--------|-------------------------------------|
| status   | enum   | `open`, `in_progress`, `resolved`, `closed` |
| priority | enum   | `low`, `medium`, `high`, `urgent`   |
| assignee | uuid   | User UUID                           |
| tag      | string | Tag name (exact match)              |
| q        | string | Free-text search on title/description (ILIKE) |

---

## 5. Status State Machine

```
                          ┌──────────────────────────────────┐
                          │         DISALLOWED               │
                          │                                  │
                          │  open ──✕──▶ resolved            │
                          │  open ──✕──▶ closed              │
                          │  in_progress ──✕──▶ open         │
                          │  in_progress ──✕──▶ closed       │
                          │  resolved ──✕──▶ open            │
                          │  closed ──✕──▶ (any)             │
                          └──────────────────────────────────┘

  ┌──────┐            ┌─────────────┐            ┌──────────┐            ┌───────┐
  │ open │─── ──── ──▶│ in_progress │─── ──── ──▶│ resolved │─── ──── ──▶│closed │
  └──────┘            └─────────────┘            └──────────┘            └───────┘
                           ▲                         │
                           │                         │
                           └─────────────────────────┘
                                  (reopen)

  Allowed transitions:
    open        → in_progress
    in_progress → resolved
    resolved    → closed
    resolved    → in_progress  (reopen)

  Same-status transitions (no-op) are also rejected.
  Setting status → resolved also sets resolved_at = now().
  Reopening (resolved → in_progress) clears resolved_at to NULL.
```

---

## 6. SLA Timer Logic

```
┌─────────────────────────────────────────────────────────────────┐
│                     SLA Target Hours                           │
│                                                                 │
│     Priority     │  Target Hours                                │
│    ─────────────┼────────────────                               │
│     urgent      │       4h                                      │
│     high        │       8h                                      │
│     medium      │      24h                                      │
│     low         │      72h                                      │
└─────────────────────────────────────────────────────────────────┘

                        computeSla(priority, created_at, resolved_at, now)
                                       │
                                       ▼
                     ┌─────────────────────────────────────┐
                     │  targetSeconds = TARGET[priority]    │
                     │                                     │
                     │  referenceDate = resolved_at ?? now │
                     │            ┌──────────┐             │
                     │            │ resolved? │             │
                     │            └────┬─────┘             │
                     │           no    │    yes              │
                     │           ▼         ▼                 │
                     │      clock runs   clock frozen       │
                     │      (now)        (resolved_at)      │
                     │                                     │
                     │  elapsed = referenceDate - created_at│
                     │  remaining = targetSeconds - elapsed │
                     │  breached = elapsed >= targetSeconds │
                     └─────────────────────────────────────┘

  Result fields returned per ticket:
    sla_target_hours      – the target for the ticket's priority
    sla_remaining_seconds – positive = time left, negative = overdue
    sla_breached          – true if elapsed ≥ target
```

When a ticket is resolved, `resolved_at` is set to `now()`, which freezes the SLA clock at that moment. If the ticket is later reopened (`resolved → in_progress`), `resolved_at` is set back to `NULL`, and the SLA clock resumes ticking from the current time.

---

## 7. Audit Log Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Audit Log Triggers                                  │
│                                                                             │
│  POST /api/tickets          │  PATCH /api/tickets/:id                       │
│  ─────────────────          │  ─────────────────────                        │
│  action: 'created'          │  status changed?  → 'status_changed'         │
│  from: null                 │    from: old status, to: new status           │
│  to: null                   │                                              │
│                             │  priority changed? → 'priority_changed'     │
│                             │    from: old priority, to: new priority      │
│                             │                                              │
│                             │  assignee changed? → 'assignee_changed'     │
│                             │    from: old name/"Unassigned"               │
│                             │    to: new name/"Unassigned"                 │
│                             │                                              │
│                             │  (title/description/tags changes             │
│                             │   are NOT audited)                           │
└─────────────────────────────────────────────────────────────────────────────┘

  All audit writes happen inside the same transaction as the ticket change
  (using withTransaction + client parameter), ensuring atomicity.

  audit_log row:
  ┌──────────────┬─────────────────────────────────────────────┐
  │ Column       │ Value                                       │
  ├──────────────┼─────────────────────────────────────────────┤
  │ ticket_id    │ UUID of the affected ticket                 │
  │ actor_id     │ req.user.id (the persona making the change) │
  │ action       │ 'created' | 'status_changed' |              │
  │              │ 'priority_changed' | 'assignee_changed'    │
  │ from_value   │ Previous value (null for 'created')         │
  │ to_value     │ New value (null for 'created')              │
  │ created_at   │ now()                                       │
  └──────────────┴─────────────────────────────────────────────┘
```

---

## 8. Frontend Architecture

```
App
 ├── Header
 │    └── Persona picker (select user → personaStore.setId)
 │
 └── <Routes>
      ├── "/"               → TicketsPage
      │    ├── Filters       (status, priority, assignee, tag, search)
      │    └── TicketList
      │         └── TicketRow  (per ticket)
      │              ├── PriorityBadge
      │              ├── StatusBadge
      │              ├── SlaBadge
      │              └── TagChips
      │
      ├── "/dashboard"      → DashboardPage
      │    └── (displays byStatus, byPriority, avgResolutionTime,
      │         slaBreachCount, topAssignees)
      │
      ├── "/tickets/new"    → NewTicketPage
      │    └── (form: title, description, priority, assignee, tags)
      │
      └── "/tickets/:id"    → TicketDetailPage
           ├── PriorityBadge
           ├── StatusBadge
           ├── SlaBadge
           ├── TagChips
           ├── AssigneePicker
           └── CommentThread
```

### Key frontend modules

| Module            | Purpose                                                     |
|-------------------|-------------------------------------------------------------|
| `api.ts`          | `apiFetch()` wrapper — auto-attaches `X-User-Id` header, JSON encode/decode, `ApiError` class |
| `personaStore.ts` | External store backed by `localStorage`; `usePersonaId()` hook via `useSyncExternalStore` |
| `bootstrap.ts`    | Fetches `/bootstrap` at app init; seeds default persona if none set |

---

## 9. Request Lifecycle

A typical authenticated API request passes through the following pipeline:

```
  Browser
    │
    │  fetch("/api/tickets", { headers: { "X-User-Id": "..." } })
    ▼
  Vite Dev Proxy (:4001)
    │  /api/* → proxy to localhost:4000
    ▼
  Express App (:4000)
    │
    ├─▶ cors()            ─ allow WEB_ORIGIN, no credentials
    ├─▶ express.json()    ─ parse JSON body
    ├─▶ requestLogger()   ─ log method + url + status + duration (skip in test)
    ├─▶ persona()         ─ read X-User-Id → DB lookup → req.user (or skip)
    │
    ├─▶ requirePersona()  ─ (per-route) 401 if req.user absent
    │
    ├─▶ route handler
    │    │
    │    ├─▶ zod .safeParse(req.body)  ── validate input
    │    │    └── fail → ApiError(400, 'VALIDATION_FAILED', issues)
    │    │
    │    ├─▶ domain logic
    │    │    ├── isAllowedTransition()   (status machine)
    │    │    ├── computeSla()            (SLA calculation)
    │    │    └── writeAudit()            (inside transaction)
    │    │
    │    ├─▶ DB query / withTransaction
    │    │    ├── query()        ── single-statement auto-commit
    │    │    └── withTransaction() ── BEGIN / fn(client) / COMMIT or ROLLBACK
    │    │
    │    └── res.json(data) or res.status(204).end()
    │
    ├─▶ notFoundHandler()  ── 404 for unmatched routes
    └─▶ errorHandler()    ── catches thrown errors
         ├── ApiError  → { error: { code, message, details? } }
         └── otherwise → 500 { error: { code: "INTERNAL_ERROR" } }
```

---

## 10. Environment & Ports

| Service          | Host Port | Container Port | Notes                                  |
|------------------|-----------|----------------|----------------------------------------|
| PostgreSQL 16    | 5544      | 5432           | Docker, `ticket-app-pg`                |
| Express API      | 4000      | —              | Node.js process                        |
| Vite Dev Server  | 4001      | —              | Proxies `/api` + `/bootstrap` → 4000 |

### Docker Compose services

```yaml
postgres:
  image: postgres:16-alpine
  container_name: ticket-app-pg
  environment:
    POSTGRES_USER: ticket
    POSTGRES_PASSWORD: ticket
    POSTGRES_DB: ticket_app
  ports: ["5544:5432"]
  volume: ticket-app-pgdata
  healthcheck: pg_isready -U ticket -d ticket_app
```

### Environment variables

| Variable      | Default                 | Used by | Description                        |
|---------------|-------------------------|---------|------------------------------------|
| `API_PORT`    | `4000`                  | api     | Express listen port                |
| `WEB_ORIGIN`  | `http://localhost:4001` | api     | Allowed CORS origin                |
| `DATABASE_URL`| —                       | api     | Postgres connection string         |
| `PGUSER`      | —                       | api     | Postgres user (overrides URL)      |
| `PGPASSWORD`  | —                       | api     | Postgres password (overrides URL)  |
| `NODE_ENV`    | `development`           | api     | Controls requestLogger & error output |

### Monorepo scripts (`package.json` root)

| Script      | What it does                                                    |
|-------------|-----------------------------------------------------------------|
| `db:up`     | `docker compose up -d postgres`                                 |
| `db:down`   | `docker compose down`                                           |
| `db:reset`  | Delegates to `apps/api run db:reset`                            |
| `dev`       | Runs both `apps/api dev` and `apps/web dev` via `concurrently`  |
| `test`      | Runs tests in all workspaces                                    |
| `typecheck` | Runs TypeScript checking in all workspaces                      |
| `lint`      | Runs linter in all workspaces                                   |
