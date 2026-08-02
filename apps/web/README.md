# OpenSchool web application

This workspace contains the Next.js marketing, authentication, and school-administration application. It is developed and verified from the monorepo root so workspace dependencies and the shared environment contract resolve consistently.

See the root [README](../../README.md) for current capability and product status, and [LOCAL_DEV.md](../../LOCAL_DEV.md) for environment, hostnames, Supabase Auth, PostgreSQL, migration, seed, and verification instructions.

```bash
# From the repository root
bun install --frozen-lockfile
bun run env:check
bun run dev
```

OpenSchool is pre-production. Do not connect this workspace to production services or use real student, family, staff, health, financial, or safeguarding data.
