# API Reference

Base URL: `http://localhost:5000` (or `5001` under Docker Compose — see `docker-compose.yml`).
All endpoints except `/auth/*` require `Authorization: Bearer <access_token>`.

## Authentication

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Registers a user, default organization, project, and queue |
| POST | `/api/auth/login` | Exchanges credentials for an access token (JWT) and refresh token |
| POST | `/api/auth/refresh` | Rotates a refresh token for a new access token |

## Queues

| Method | Path | Description |
|---|---|---|
| GET | `/api/queues?projectId=ID` | List queues for a project, with job counts |
| POST | `/api/queues` | Create a queue with a custom concurrency limit |
| PUT | `/api/queues/:id/pause` | Pause polling on a queue |
| PUT | `/api/queues/:id/resume` | Resume polling |

## Jobs

| Method | Path | Description |
|---|---|---|
| POST | `/api/jobs` | Enqueue an immediate, delayed (`nextRunAt`), or dependent (`parentJobId`) job |
| POST | `/api/jobs/recurring` | Create a recurring job from a cron expression |
| GET | `/api/jobs?projectId=ID&queueId=ID&status=STATUS` | Paginated job lookup with filters |
| GET | `/api/jobs/:id/logs` | Execution log history for a job |
| PUT | `/api/jobs/:id/retry` | Manually requeue a failed/DLQ job |

## Real-time metrics

`apps/api/src/metrics/metrics.gateway.ts` exposes a Socket.IO namespace that broadcasts job-state transitions (`broadcastJobStateChange`) so the dashboard can update without polling.

## Auth model

- Access tokens are short-lived JWTs (`apps/api/src/auth/jwt.strategy.ts`); refresh tokens are stored in the `RefreshToken` table and rotated on use.
- Role-based access control is enforced via the `@Roles(...)` decorator + `RolesGuard` (`apps/api/src/auth/roles.guard.ts`), checked against `UserRole` (`ADMIN` / `MEMBER`).

## Error handling & validation

Controllers use NestJS's built-in `ValidationPipe` against DTOs in `packages/shared/src`, and throw `NotFoundException` / `BadRequestException` for domain errors (e.g. invalid cron expression, missing parent job), which NestJS's exception filter turns into structured JSON error responses.
