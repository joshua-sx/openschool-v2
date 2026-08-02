# Unapproved database policy drafts

Nothing in this directory is part of the executable migration path.

`0003_enable_rls.sql.disabled` is a preserved design draft only. It has not passed the tenant-isolation, recursion, `TO` role, `WITH CHECK`, mutation, or performance review required for production RLS. Do not rename or apply it. Replace it with newly reviewed migrations only after the database execution-model decision in #68 is approved.

The executable baseline is exactly the SQL files listed in `../migrations/meta/_journal.json`. The migration-integrity test fails if an unjournaled SQL file is placed in `../migrations`.
