# Design Decisions & Trade-offs

## Postgres row-locking instead of Redis/BullMQ

**Decision:** use `SELECT ... FOR UPDATE SKIP LOCKED` directly against Postgres for job claiming rather than a dedicated queue broker (Redis, RabbitMQ, BullMQ).

**Why:** it keeps the system to a single stateful dependency (Postgres already holds all the domain data), and Postgres row locks give the same exactly-once claim guarantee a broker would, without an extra moving part to operate or reason about failure modes for.

**Trade-off:** at very high throughput a dedicated in-memory broker will out-perform polling a relational table. This project prioritizes operational simplicity and correctness over maximum throughput, which matches the brief's evaluation weighting (concurrency/reliability correctness mattered more than raw performance).

## Polling worker loop instead of `LISTEN`/`NOTIFY`

The worker polls every second rather than using Postgres `LISTEN`/`NOTIFY` for push-based wake-up. Polling is simpler to reason about and test; the trade-off is up to ~1s of added latency between a job becoming eligible and being picked up, which is acceptable for a background job scheduler (as opposed to, say, a real-time trading system).

## Scheduler engine embedded in the API process

Delayed-job promotion, cron triggering, and stale-worker recovery run as `setInterval` loops inside `apps/api` rather than as a fourth deployable. They're lightweight and don't need independent scaling, so a separate service would add deployment overhead without a corresponding benefit. If cron volume grew large enough to need its own scaling, this would be the first piece to extract.

## Mocked job processors

The three processors in `apps/worker/src/worker.service.ts` (`send_email`, `generate_report`, `webhook_trigger`) simulate work with `setTimeout` and can be told to fail via a `payload.fail` flag. This is intentional — the assignment's focus is the scheduling/reliability engine, not integrating a real email or webhook provider. A production version would register real handlers behind the same `PROCESSORS` map interface.

## Known gaps / what's not done

Being upfront about what's incomplete relative to the brief:

- **Testing** is the weakest area: `apps/api/src/auth/auth.spec.ts` and `apps/worker/src/worker.spec.ts` test pure logic (bcrypt hashing, retry-delay math) in isolation rather than exercising the actual `AuthService` / `WorkerService` classes, and there's no integration or e2e coverage of the atomic-claim path against a real database. Adding a test-container-backed integration test for `claimJobAtomic` would be the highest-value next addition.
- **Bonus features not attempted:** rate limiting, distributed locking beyond Postgres row locks, queue sharding, AI-generated failure summaries.
- **Deliverables like this design doc, the ER diagram, and API reference** were originally embedded as sections in the root README rather than delivered as separate files — this repo now splits them out under `docs/` to match the brief's deliverables list more literally.
