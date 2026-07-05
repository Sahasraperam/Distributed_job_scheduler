# codity Distributed Job Scheduler

A production-inspired, highly concurrent, distributed background job scheduler built on PostgreSQL, using NestJS, Next.js 15, Prisma, and Socket.IO.

## Key features

- **Monorepo** (npm workspaces): `apps/api`, `apps/worker`, `apps/dashboard`, `packages/database`, `packages/shared`
- **Atomic job claiming** via PostgreSQL `SELECT ... FOR UPDATE SKIP LOCKED` — no double execution, no external lock service
- **Per-queue and per-worker concurrency limits**
- **Failover & recovery** — stale worker heartbeats trigger job requeue or promotion to the Dead Letter Queue
- **Configurable retries** — fixed, linear, and exponential backoff
- **Workflow dependencies** — parent/child job chains
- **Real-time dashboard** — queue health, worker status, job explorer, live metrics over WebSockets

## Diagrams

**System architecture**

![System architecture diagram](docs/diagrams/architecture-diagram.png)

**Entity relationship diagram**

![Entity relationship diagram](docs/diagrams/er-diagram.png)

> Scalable `.svg` originals: [`architecture-diagram.svg`](docs/diagrams/architecture-diagram.svg) · [`er-diagram.svg`](docs/diagrams/er-diagram.svg)

For how these pieces fit together, see:

| Doc | Covers |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Service breakdown, architecture diagram, atomic-claim mechanics |
| [`docs/DATABASE.md`](docs/DATABASE.md) | ER diagram, schema decisions, indexing |
| [`docs/API.md`](docs/API.md) | REST endpoint reference |
| [`docs/DESIGN_DECISIONS.md`](docs/DESIGN_DECISIONS.md) | Trade-offs, and what's intentionally out of scope |

Each app also has its own README with folder-level detail: [`apps/api`](apps/api/README.md) · [`apps/worker`](apps/worker/README.md) · [`apps/dashboard`](apps/dashboard/README.md) · [`packages/database`](packages/database/README.md).

## Local development

### Requirements
- Node.js v20+
- PostgreSQL

### Setup

```bash
cp .env.example .env          # then fill in DATABASE_URL / JWT_SECRET
npm install --legacy-peer-deps

npm run build --workspace=packages/shared
npm run db:migrate
npm run db:seed
```

### Run everything

```bash
npm run dev        # runs api + worker + dashboard concurrently
```

Or individually: `npm run dev:api`, `npm run dev:worker`, `npm run dev:dashboard`.

## Docker Compose

```bash
docker-compose up --build
```

Dashboard: `http://localhost:3000`. Seed accounts:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@codity.com` | `password123` |
| Member | `member@codity.com` | `password123` |

> Seed passwords are for local development only — never reuse them outside a local/dev database.
# Distributed_job_scheduler
