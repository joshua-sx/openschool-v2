# Local development

OpenSchool currently uses two development services:

- PostgreSQL for the application schema, migrations, and representative seed data;
- Supabase Auth for browser authentication.

The repository provides a deterministic PostgreSQL container. Use a dedicated hosted Supabase development project for authentication, or operate a complete local Supabase stack separately. Do not use production projects, credentials, or real school data.

## Prerequisites

- Bun 1.3.14
- Docker with Compose support for the repository-managed database
- a dedicated Supabase development project if testing sign-up or sign-in

## One-time setup

```bash
git clone https://github.com/joshua-sx/openschool-v2.git
cd openschool-v2
bun install --frozen-lockfile
bun run env:setup
```

`env:setup` creates a root `.env.local` without overwriting an existing file. Replace the two Supabase placeholders with the project URL and publishable key from the project's API Keys settings. A legacy anon JWT remains accepted during Supabase's key transition, but a secret or service-role key is rejected.

The supported variables are:

| Variable | Exposure | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser | Dedicated development Supabase origin |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser | Publishable key or legacy anon key; never a secret/service-role key |
| `DATABASE_URL` | server only | Application PostgreSQL connection |
| `NEXT_PUBLIC_APP_URL` | browser | Authenticated application origin |
| `NEXT_PUBLIC_WWW_URL` | browser | Marketing and authentication origin |

Validate the file without printing credentials:

```bash
bun run env:check
```

The command reports only origins, key type, and database host. Configuration errors identify the invalid variable and stop startup/build paths that consume it.

## Local hostnames

Add the development origins to `/etc/hosts`:

```text
127.0.0.1 app.openschool.local
127.0.0.1 www.openschool.local
```

The included helper performs the same change and requires administrator access:

```bash
bash scripts/setup-localhost.sh
```

In the dedicated Supabase project's Authentication URL settings, configure:

- Site URL: `http://www.openschool.local:3000`
- Redirect URL: `http://app.openschool.local:3000/auth/callback`
- Redirect URL: `http://www.openschool.local:3000/auth/callback`

## Database setup

Start PostgreSQL, validate the migration journal, migrate, and seed:

```bash
bun run db:start
bun run db:check
bun run db:migrate
bun run db:seed
```

The seed is idempotent and creates two Tenants with pooled placements; a ministry, board, network, district, and second-Tenant hierarchy; three Schools spanning primary, secondary, and all-through profiles; organization and School roles; classes, students, enrollments, a parent relationship, and a representative grade. Seeded user records are application fixtures; they are not login identities in Supabase Auth.

Stop PostgreSQL without deleting its named volume:

```bash
bun run db:stop
```

To deliberately reset the development database, stop the stack and remove the `openschool_openschool-postgres` Docker volume manually. This erases local data and should never be run against a shared environment.

## Run the application

```bash
bun run dev
```

Open:

- marketing and authentication: <http://www.openschool.local:3000>
- application: <http://app.openschool.local:3000>

The middleware redirects unauthenticated application requests to the marketing hostname's login route and authenticated users away from its auth pages.

## Verification before a pull request

```bash
bun install --frozen-lockfile
bun run env:check
bun run audit:security
bun run check
bun run lint
bun run typecheck
bun test
bun run db:check
bun run build
```

GitHub Actions additionally provisions a clean PostgreSQL service, applies all migrations, seeds it, repeats both operations, and runs the guarded [transaction-scoped RLS proof](./packages/db/security-poc/README.md) through real non-owner roles. The proof is destructive and intentionally refuses non-loopback database hosts.

CI also runs the guarded [Tenant and Education Organization proof](./packages/db/TENANT_HIERARCHY.md) and a separate upgrade job that starts with representative data at migration `0002`, applies the Tenant foundation twice, and verifies the backfill and constraints.

## Database policy safety

Only SQL files recorded in `packages/db/migrations/meta/_journal.json` are executable migrations. The previous RLS proposal is preserved as a disabled design draft under `packages/db/policy-drafts/`; it is intentionally excluded from the migration path until the tenant execution model and policies receive dedicated security review in #68.

## Troubleshooting

### Environment validation fails

Run `bun run env:check` and correct the named variable in the root `.env.local`. The example values for the Supabase URL and key are intentionally invalid placeholders.

### PostgreSQL is unavailable

Confirm Docker is running and inspect `docker compose ps`. The container binds PostgreSQL to `127.0.0.1:54322` through the URL in `.env.example`.

### Authentication callback is rejected

Confirm the exact callback origins are allowed in the dedicated Supabase development project and that the two application origins in `.env.local` remain distinct.

### Seeded users cannot sign in

That is expected: database fixtures do not create Supabase Auth identities. Create a development-only account through the sign-up flow when testing authentication. Full identity provisioning and tenant invitation workflows are tracked beyond this foundation milestone.
