# apps/dashboard

Next.js 15 (App Router) dashboard for managing queues, inspecting jobs, and monitoring workers.

```
src/
├── app/
│   ├── login/            # Login page
│   └── dashboard/
│       ├── page.tsx      # Overview: system health, throughput
│       ├── queues/       # Queue list, pause/resume, concurrency config
│       ├── jobs/         # Job explorer, filters, logs
│       └── workers/      # Worker status, load, heartbeats
├── context/AuthContext.tsx     # JWT session state
└── providers/QueryProvider.tsx # React Query provider for data fetching
```

Live updates come from the API's Socket.IO gateway (`apps/api/src/metrics/metrics.gateway.ts`) rather than polling, so job-state changes on the queue/jobs/workers pages appear without a refresh.

Run standalone: `npm run dev:dashboard` (from repo root) or `npm run dev` (from this folder). Requires `apps/api` running to have any data to show.
