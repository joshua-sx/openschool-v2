# Households and residences operating contract

This contract defines the #116 household and residence slice. It remains pre-production and does
not authorize real school data.

## Independent facts

- A Household is a Tenant-scoped administrative grouping. It does not imply a nuclear family,
  custody, guardianship, pickup permission, portal access, or Account identity.
- A Person may have multiple effective Household Memberships. `resident` and `associated` describe
  operational membership only; legal and access powers remain on their own records.
- Primary residence and primary mailing are independent, effective-dated preferences. PostgreSQL
  exclusion constraints prevent either preference from overlapping for one Person while preserving
  alternative and historical households.
- Addresses have a stable lineage key and immutable versions. Revisions close the previous version
  and create a new row so historical operational records keep their original address context.
- Address type, primary address status, and member preferences are separate. Delivery instructions
  are sensitive operational data and never imply authority.

## Authorization and execution

`tenant.households.read` and `tenant.households.manage` use the existing Tenant, Organization
subtree, and School constraints. Management requires AAL2 and atomic audit obligations. School
scope may act only on learners and contacts already authorized by the canonical enrollment and
guardian-contact boundaries; sibling-School membership does not expand authority.

All three tables force RLS. Runtime writes are denied. A `NOLOGIN`, `NOINHERIT`, `NOBYPASSRLS`
scope resolver exposes only a boolean scope decision, and a separate Household manager owns the
guarded mutation functions. Runtime, worker, and control-plane logins cannot assume either role.
The database—not the UI—owns effective-period, primary-preference, lineage, and stale-version
invariants.

## Privacy, audit, and UX

Reads expose only members independently allowed in the request scope. Address data is returned only
after the Household has an authorized learner/contact anchor. Audit summaries record allowlisted
field names and classifications, not address lines, postal codes, delivery instructions, names, or
record snapshots.

The learner profile must call these records “households” and “residences,” explicitly state that
residence does not establish custody, and distinguish current, alternative, and historical facts.
Conflicts and unavailable records use non-enumerating responses.
