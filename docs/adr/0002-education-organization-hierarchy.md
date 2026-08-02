# ADR-0002: Education Organization hierarchy and School scope

- Status: Accepted
- Date: 2026-08-02
- Owner: Product Architecture
- Governs: #68 and organization/school access work

## Context

A ministry may oversee boards, regions, or networks that govern many Schools. Current organization-to-school membership is flat, organization administrators do not reliably receive descendant School access, and a caller can request mismatched organization and School identifiers.

## Decision

Model administrative units as effective-dated Education Organizations in an Organization Tree. Each node has a type, parent, validity period, and Tenant. Maintain a closure table for ancestor/descendant queries and historical snapshots. A School belongs to one governing Education Organization at a point in time and retains its own operational identifier and configuration.

Affiliations specify scope explicitly: exact organization, organization subtree, exact School, or assigned class/relationship. Organization roles do not imply subtree scope unless the grant says so. An active School must belong to the selected organization subtree and Tenant; mismatches fail with a context reason code.

Primary and high schools use the same School interface. School profile, academic calendar, grade/level taxonomy, course complexity, credit rules, and timetable configuration express their differences.

## Options rejected

- **One flat organization with all Schools:** loses delegated regional/board administration.
- **A fixed ministry-board-school column chain:** cannot support networks, districts, campuses, or jurisdiction variation.
- **Materialized School IDs stored on every affiliation:** becomes stale when the tree changes and destroys locality.
- **Role name implies all descendants:** makes delegation invisible and difficult to revoke.

## Consequences

Tree changes and School transfers are privileged, effective-dated operations. Closure-table writes require a single tested module and cycle prevention. Authorization and reports can resolve descendant scope efficiently, while records retain historical governing context.

## Migration path and rollback

Create the tree and closure structures alongside existing organizations, import each current organization as a root, and attach existing Schools. Dual-read consistency tests precede cutover. Rollback returns reads to the flat tables while preserving the new records for diagnosis.
