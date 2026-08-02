# Dependency security

Last verified: 2026-08-02

OpenSchool is pre-production, but dependency risk is treated as a release gate. A clean automated scan does not prove that the application is secure; it only establishes that known package advisories are being managed consistently.

## Inventory

The repository uses one Bun workspace and one text lockfile. Direct dependencies are declared by the workspace that imports them; `bun.lock` is the authoritative inventory of resolved direct, transitive, optional, peer, and workspace packages.

| Workspace | Runtime dependencies | Development dependencies |
| --- | --- | --- |
| root | none | Biome, Node types, Turbo, TypeScript |
| `apps/web` | internal audit/auth/db/RBAC packages; Supabase Auth UI and SSR; TanStack Query; tRPC client, React Query, and server; Drizzle ORM; Framer Motion; Lucide; Next.js; React; Zod | Tailwind PostCSS adapter; React types; ESLint and Next config; Tailwind; TypeScript |
| `packages/audit` | internal database and RBAC packages | TypeScript |
| `packages/auth` | internal database and RBAC packages; Supabase JS and SSR; Drizzle ORM | TypeScript |
| `packages/db` | Drizzle ORM; Postgres.js | dotenv; Drizzle Kit; TypeScript |
| `packages/rbac` | tRPC server | TypeScript |

Use these commands to inspect the resolved graph:

```bash
bun install --frozen-lockfile
bun pm ls --all
bun why <package>
bun audit
```

Do not rely on accidental workspace hoisting. Every imported package must be declared in the importing workspace, even when another workspace already installs it.

## Enforcement

- `bun run audit:security` fails local and GitHub quality checks when the lockfile contains a known high or critical advisory.
- GitHub dependency review rejects pull requests that introduce high or critical advisories in development, runtime, or unknown scopes.
- Dependabot checks the Bun lockfile and GitHub Actions weekly. Routine Bun minor/patch updates, security updates, and Actions updates are grouped separately; major Bun upgrades remain individual for focused review. Dependabot alerts and automatic security updates are enabled at repository level.
- GitHub secret scanning and push protection are enabled. There were no open secret-scanning alerts when this policy was last verified.
- Frozen installs, linting, type checks, tests, and the production build must pass after every dependency change.

The default release threshold is zero unexpired critical or high advisories. New exceptions must name the advisory, affected path, reachability, owner, mitigation, and expiry date in this document. A scan exclusion without that record is not permitted.

| Severity | Default remediation target |
| --- | --- |
| Critical | 24 hours; block merge and release |
| High | 7 days; block merge and release |
| Moderate | 30 days when reachable; otherwise document and monitor |
| Low | 90 days or the next routine update cycle |

## 2026-08-02 remediation baseline

The initial Bun audit reported 98 advisories across 16 packages: 1 critical, 38 high, 52 moderate, and 7 low. The remediated lockfile reports one moderate advisory and no critical or high advisories.

| Affected path | Disposition |
| --- | --- |
| `shell-quote` through Drizzle Kit | Critical advisory removed by upgrading Drizzle Kit and regenerating the lockfile. |
| Drizzle ORM | Upgraded to the first patched release for the SQL identifier injection advisory. |
| Next.js | Upgraded from 16.1.1 to 16.2.12 to remove the known server, middleware, cache, and request-handling advisories present in the original lockfile. |
| Hono | Removed because the application had no imports or runtime use. This also removed its JWT, static-file, CORS, and middleware advisory surface. |
| tRPC Next adapter | Removed because the App Router integration uses the fetch adapter from `@trpc/server`; no `@trpc/next` import existed. |
| Supabase realtime WebSocket path | Upgraded Supabase JS; the regenerated graph selected the patched `ws` release. |
| Turbo | Upgraded to remove known CLI advisories. |
| `brace-expansion`, `flatted`, `js-yaml`, `minimatch`, and `picomatch` | Regenerated the stale lockfile so every parent range resolves to its patched compatible release. |
| PostCSS | Root override requires `>=8.5.25` because Next.js 16.2.12 still declares an exact vulnerable 8.4.31 release. The application passes lint, type checks, tests, and production compilation with the override. Remove the override when Next.js declares a patched compatible release. Owner: platform engineering. Review by 2026-09-02. |
| Sharp/libvips | Root override requires Sharp `>=0.35.0` because Next.js 16.2.12 still allows only the vulnerable 0.34 line. A live Sharp 0.35/libvips transform and the Next image route were smoke-tested. Remove the override when Next.js adopts the patched line. Owner: platform engineering. Review by 2026-09-02. |

### Active moderate exception

`GHSA-67mh-4wv8-2f99` affects esbuild 0.18.20 through Drizzle Kit's deprecated `@esbuild-kit/esm-loader` dependency. It is development-only, is not included in the application runtime, and the vulnerable behavior requires exposing esbuild's development server to a malicious website. OpenSchool does not run that server in CI or its application scripts.

- Owner: platform engineering
- Mitigation: do not expose Drizzle/esbuild development servers to a network; continue using the patched esbuild paths that Drizzle Kit uses for its normal CLI execution.
- Resolution: upgrade Drizzle Kit when it removes the deprecated loader, or replace the migration CLI path if upstream does not remediate.
- Expiry/review: 2026-09-02

## Dependency-change checklist

1. Confirm that the package is needed and place it in the importing workspace.
2. Prefer the smallest supported upgrade that removes the advisory.
3. Run `bun why` for transitive findings and classify runtime versus development reachability.
4. Avoid overrides unless the parent cannot yet select a patched release; document and time-limit every override.
5. Run the complete quality workflow and inspect unexpected lockfile or migration changes.
6. Do not describe dependency scanning as a security, privacy, compliance, or penetration test.
