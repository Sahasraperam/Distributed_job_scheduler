# packages/database

Shared Prisma schema, migrations, and generated client. Both `apps/api` and `apps/worker` depend on this package (`@codity/database`) instead of each defining their own schema — this is what guarantees the two services never disagree about the shape of the data.

```
prisma/
├── schema.prisma           # Single source of truth for the schema
├── migrations/             # Generated migration history
└── seed.ts                 # Creates demo org/users/queue for local dev
src/
└── index.ts                 # Re-exports the generated Prisma client + enums
```

See [`docs/DATABASE.md`](../../docs/DATABASE.md) for the ER diagram and the reasoning behind indexes, cascade rules, and the multi-tenancy model.

## Common commands (run from repo root)

```bash
npm run db:generate   # regenerate the Prisma client after a schema change
npm run db:migrate    # create + apply a new migration
npm run db:seed       # populate demo data
```
