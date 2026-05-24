# Support Ticket App

Support Ticket App — a full-stack ticket management system for Codex demo walkthroughs.

## Tech Stack

| Layer     | Technology                              |
| --------- | --------------------------------------- |
| API       | Node.js, Express, TypeScript            |
| Frontend  | React, Vite, TypeScript                 |
| Database  | Postgres 16 (Docker)                    |
| Tooling   | npm workspaces, Vitest, ESLint          |

## Prerequisites

- Node.js 20+
- Docker Desktop (for the local Postgres container)

## Quick Start

```bash
git clone <repo-url> && cd ticket-app
cp .env.example .env          # edit PGUSER / PGPASSWORD if needed
npm install
npm run db:up                 # start Postgres container
npm run db:reset              # apply schema & seed data
npm run dev                   # API on :4000, web on :4001
```

## Running Tests / Checks

```bash
npm run test        # unit & integration tests (Vitest)
npm run typecheck   # TypeScript checks across workspaces
npm run lint        # ESLint across workspaces
```

Run against a single workspace:

```bash
npm -w apps/api run test
npm -w apps/web run typecheck
```

## Project Structure

```
ticket-app/
├── apps/
│   ├── api/                  # Express + TypeScript API
│   │   ├── src/
│   │   │   ├── domain/       # business logic (tickets, comments, audit, SLA)
│   │   │   ├── routes/       # Express route handlers
│   │   │   ├── schemas/      # Zod validation schemas
│   │   │   ├── middleware/   # auth, error handling
│   │   │   └── lib/          # shared utilities
│   │   ├── migrations/       # SQL migration files
│   │   ├── seed/             # demo seed data
│   │   └── tests/            # API integration tests
│   └── web/                  # Vite + React + TypeScript client
│       └── src/
│           ├── pages/        # route-level page components
│           ├── components/   # shared UI components
│           ├── domain/       # client-side domain logic
│           └── styles.css    # app styles
├── docker-compose.yml
├── package.json              # workspace root scripts
├── tsconfig.base.json
└── .env.example
```

## Key Features

- **Tickets CRUD** — create, read, update, delete support tickets
- **Status state machine** — open → in_progress → resolved / closed with enforced transitions
- **Priorities** — low, medium, high, urgent
- **Assignees** — assign tickets to team members
- **Tags** — categorize tickets with labels
- **Comments** — threaded comments on tickets
- **SLA timer** — priority-based SLA targets with countdown badge
- **Audit log** — automatic logging of ticket creates and field mutations
- **Dashboard** — stats overview with GET `/api/dashboard` endpoint and DashboardPage
- **Persona switcher** — toggle between user personas for demo walkthroughs
- **URL-persistent filters** — ticket list filters and search persisted in the URL query string

## Environment Variables

Copy `.env.example` to `.env` and fill in values:

```
DATABASE_URL=postgres://localhost:5544/ticket_app
PGUSER=changeme
PGPASSWORD=changeme
API_PORT=4000
WEB_PORT=4001
```

`DATABASE_URL` points at the Postgres container on `localhost:5544`. Set `PGUSER` and `PGPASSWORD` to match the values in `docker-compose.yml`.

## Common Scripts

| Script              | Description                                    |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Run API and web client concurrently            |
| `npm run db:up`     | Start the Postgres container                   |
| `npm run db:down`   | Stop the Postgres container                    |
| `npm run db:reset`  | Drop, recreate, and reseed the database        |
| `npm run test`      | Run tests across all workspaces                |
| `npm run typecheck` | Run TypeScript type checks across workspaces   |
| `npm run lint`      | Run linters across all workspaces              |
