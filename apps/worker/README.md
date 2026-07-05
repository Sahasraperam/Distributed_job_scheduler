# apps/worker

The execution engine. One or many instances of this service poll the database, atomically claim jobs, and run them.

```
src/
├── worker.service.ts   # Everything: claim loop, execution, retry/DLQ logic,
│                       # heartbeats, graceful shutdown, mocked job processors
├── prisma.service.ts
├── env.ts
└── main.ts
```

`worker.service.ts` is intentionally a single file — the claim → execute → succeed/fail pipeline is one continuous flow, and splitting it into several files at this size would add indirection without adding clarity. If job-processor logic grows (real integrations instead of the current mocked `send_email` / `generate_report` / `webhook_trigger`), pull `PROCESSORS` out into its own `processors/` directory first.

## Scaling

Run multiple replicas of this service to add capacity — each instance registers itself as a distinct `Worker` row and claims independently via `SELECT ... FOR UPDATE SKIP LOCKED`, so replicas never double-claim a job. Concurrency per replica is set via `WORKER_CONCURRENCY` (see `.env.example`).

Run standalone: `npm run dev:worker` (from repo root) or `npm run start:dev` (from this folder).
