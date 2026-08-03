# Database policy draft quarantine

Nothing in this directory is part of the executable migration path.

The original `0003_enable_rls.sql.disabled` proposal was deleted after the reviewed replacement, `0014_student_school_forced_rls`, passed clean-database, upgrade, role, mutation, isolation, and query-plan evidence. It must not be restored or applied; it used a different execution model and never became a migration.

The executable baseline is exactly the SQL files listed in `../migrations/meta/_journal.json`. The migration-integrity test fails if an unjournaled SQL file is placed in `../migrations`.
