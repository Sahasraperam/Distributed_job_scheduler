# Database Design

Full schema lives at `packages/database/prisma/schema.prisma` — this doc explains the shape and the reasoning behind it. Regenerate the client after any schema change with `npm run db:generate`.

## ER diagram

```mermaid
erDiagram
    User {
        string id PK
        string email
        string passwordHash
        string firstName
        string lastName
        string role
        DateTime createdAt
    }
    Organization {
        string id PK
        string name
    }
    Project {
        string id PK
        string name
        string organizationId FK
    }
    Queue {
        string id PK
        string name
        string projectId FK
        int concurrencyLimit
        boolean isPaused
    }
    Job {
        string id PK
        string projectId FK
        string queueId FK
        string name
        json payload
        string status
        int priority
        int attemptsMade
        int maxAttempts
        DateTime nextRunAt
        string parentJobId FK
    }
    ScheduledJob {
        string id PK
        string projectId FK
        string queueId FK
        string cronExpression
        string timezone
        DateTime nextRunAt
        boolean isActive
    }
    JobExecution {
        string id PK
        string jobId FK
        string workerId FK
        string status
        int durationMs
    }
    DeadLetterQueue {
        string id PK
        string jobId FK
        string queueId FK
        string failureReason
    }
    Worker {
        string id PK
        string name
        string status
    }
    WorkerHeartbeat {
        string id PK
        string workerId FK
        float loadPercentage
        int runningJobsCount
        DateTime timestamp
    }
    JobLog {
        string id PK
        string jobId FK
        string level
        string message
        DateTime timestamp
    }

    User ||--o{ OrgMember : belongs
    Organization ||--o{ OrgMember : contains
    Organization ||--o{ Project : has
    Project ||--o{ Queue : configures
    Project ||--o{ Job : tracks
    Queue ||--o{ Job : holds
    Job ||--o{ JobExecution : records
    Job ||--o{ JobLog : records
    Job ||--o{ DeadLetterQueue : routes
    Worker ||--o{ Job : claims
    Worker ||--o{ WorkerHeartbeat : writes
    ScheduledJob ||--o{ Job : spawns
```

![Entity relationship diagram](diagrams/er-diagram.png)

*Scalable original: [`diagrams/er-diagram.svg`](diagrams/er-diagram.svg)*

## Notable decisions

- **Multi-tenancy via `Organization` → `OrgMember` → `User`**, so a user can belong to multiple orgs with different roles rather than one role per user globally.
- **`Job.parentJobId` self-relation** implements simple workflow dependencies — a child job is created as `SCHEDULED` and only promoted to `QUEUED` once its parent completes (see `promoteChildJobs` in the worker).
- **Composite index `(status, queueId, priority DESC, nextRunAt ASC)` on `Job`** — this is the exact predicate + sort order the atomic-claim query uses, so claiming stays an index scan even as the jobs table grows.
- **Separate `JobLog` and `JobExecution` tables** — `JobExecution` is one row per attempt (for metrics/duration), `JobLog` is an append-only human-readable trail (for the dashboard's log viewer). Keeping them separate avoids overloading one table with two different access patterns.
- **`onDelete: Cascade` vs `SetNull`** — child records that have no meaning without their parent (e.g. `JobExecution`, `JobLog`) cascade-delete; references that should survive deletion of the referenced row (e.g. `Job.retryPolicyId`, `Job.workerId`) use `SetNull` so a deleted retry policy or offline worker doesn't destroy job history.
- **`RefreshToken` and `AuditLog`** exist beyond the brief's minimum entity list — refresh tokens support JWT rotation, and the audit log gives a place to record privileged actions (queue pause/resume, manual retries) for RBAC-relevant traceability.

## Migrations

Migrations live in `packages/database/prisma/migrations/`. To create a new one after editing the schema:

```bash
npm run db:migrate --workspace=packages/database
```
