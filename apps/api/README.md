# apps/api

NestJS service exposing the REST API, auth, and the background **scheduler engine**.

```
src/
├── auth/         # JWT auth, RBAC guard/decorator, login/register/refresh
├── jobs/         # Create/list/retry jobs, recurring (cron) job creation
├── queues/       # Create/list/pause/resume queues
├── metrics/      # Socket.IO gateway broadcasting job-state changes
├── scheduler/    # Background loops: delayed-job promotion, cron triggers,
│                 # stale-worker recovery (this is NOT the worker — see apps/worker)
├── prisma.service.ts
├── env.ts
└── main.ts
```

Each feature folder follows the same NestJS shape: `*.controller.ts` (HTTP layer) → `*.service.ts` (business logic) → `*.module.ts` (wiring). This keeps the layer a request passes through consistent across features, so `jobs/jobs.service.ts` and `queues/queues.service.ts` read the same way even though they do different things.

**Why the scheduler lives here and not in `apps/worker`:** the worker's job is claiming and *executing* work; the scheduler's job is deciding *when* work becomes eligible (cron ticks, delayed-job promotion) and recovering from *worker failure*. Colocating the scheduler with the API keeps that separation explicit — see [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) for the full reasoning.

Run standalone: `npm run dev:api` (from repo root) or `npm run start:dev` (from this folder).
