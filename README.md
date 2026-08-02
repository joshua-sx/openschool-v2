# OpenSchool

OpenSchool is a pre-production school administration platform under active development. The long-term goal is an operating system that can support one school or a multi-school education organization without duplicating core workflows.

> **Development status:** This repository is not approved for production use and must not be used with real student, family, staff, health, financial, or safeguarding data.

[Current capability evidence](./docs/CAPABILITY_STATUS.md) · [M0 delivery milestone](https://github.com/joshua-sx/openschool-v2/milestone/1) · [Issue tracker](https://github.com/joshua-sx/openschool-v2/issues)

## What works today

The current development preview contains a narrow administrator-facing slice:

- a Next.js application shell and marketing/auth routes;
- Supabase email authentication helpers and callback/sign-out routes;
- schemas for organizations, schools, users, memberships, classes, enrollments, students, grades, and audit events;
- basic student list, create, detail, and edit flows;
- early tenant-context, permission, and audit primitives;
- CI-enforced formatting, linting, workspace type checks, unit tests, and production build.

These components are not equivalent to a production-ready student information system. Multi-tenant isolation, scoped authorization, RLS, invitations, audit integrity, operational recovery, and complete school workflows remain active work.

## What is not available

OpenSchool does not currently provide production-ready attendance, gradebook/report cards, parent or student portals, messaging, announcements, admissions, scheduling, billing, document management, analytics, integrations, native mobile apps, compliance reporting, or customer support.

See [docs/CAPABILITY_STATUS.md](./docs/CAPABILITY_STATUS.md) for the evidence and status of each area.

## Product direction

The intended platform serves primary and high schools through one shared domain model. High-school requirements drive the complex course, schedule, credit, and assessment cases; primary schools use the same foundations through simpler operating profiles.

Implementation is dependency-ordered:

1. truthful, reproducible engineering foundation;
2. verified tenant isolation, identity, authorization, RLS, and audit;
3. people, school, enrollment, and academic structure;
4. complete operational workflows such as attendance and reporting;
5. portals, communications, admissions, documents, finance, analytics, and integrations.

## Technology

- **Monorepo:** Turborepo
- **Runtime and package manager:** Bun 1.3.14
- **Web:** Next.js 16, React 19, TypeScript
- **Styling:** Tailwind CSS 4
- **API:** tRPC 11
- **Authentication:** Supabase Auth helpers
- **Database:** PostgreSQL with Drizzle ORM
- **Quality:** Biome, ESLint, TypeScript, Node-compatible tests, GitHub Actions

No supported production hosting configuration is published yet.

## Repository structure

```text
openschool-v2/
├── apps/
│   └── web/             # Next.js application
├── packages/
│   ├── audit/           # Early audit-event helper
│   ├── auth/            # Supabase and tenant-context helpers
│   ├── db/              # Drizzle schema and migrations
│   └── rbac/            # Role and permission primitives
├── scripts/             # Local development utilities
└── docs/                # Product, engineering, and workflow documentation
```

## Local development

Environment and migration reproducibility is being corrected in [#66](https://github.com/joshua-sx/openschool-v2/issues/66). Until that work is complete, local setup is for contributors who can inspect and supply the required development-only configuration themselves.

```bash
git clone https://github.com/joshua-sx/openschool-v2.git
cd openschool-v2
bun install --frozen-lockfile
```

The application currently reads these variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `DATABASE_URL`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_WWW_URL`

Do not commit credentials. See [LOCAL_DEV.md](./LOCAL_DEV.md) for the current development workflow and #66 for known setup limitations.

```bash
# Start development
bun run dev

# Run the enforced local quality gate
bun run check
bun run lint
bun run typecheck
bun test

# Build with valid development configuration
bun run build
```

Database generation and migration commands exist, but the seed command and migration/RLS history are not yet a verified clean-setup path. Track that work in #66 rather than using the repository with real data.

## Security and privacy status

Security-sensitive code exists, but the platform has not completed a production security or privacy review. In particular:

- tenant isolation is not yet proven across all access paths;
- the permission model and organization hierarchy require redesign and negative testing;
- existing RLS policies are not an approved production boundary;
- audit writes are not yet guaranteed to be atomic with mutations;
- backup, restore, incident response, retention, and offboarding are not demonstrated;
- no FERPA, GDPR, or jurisdiction-specific compliance claim is made.

Security and privacy decisions are tracked in [#68](https://github.com/joshua-sx/openschool-v2/issues/68) and subsequent M1 work.

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a change. Pull requests must pass the same frozen-install, check, lint, type-check, test, and build workflow enforced in GitHub Actions.

## License

The repository does not currently state a reuse or deployment license. Obtain appropriate guidance before planning reuse or deployment.
