# Supabase

Database schema, Row Level Security policies and migrations go here as `.sql` files, so the whole team can see and review every change to the database.

Name migrations with a number and what they do, for example `001_plants_table.sql`, `002_rls_policies.sql`.

Rules from our design:

- Row Level Security is turned on for every table.
- Public users only see approved records, and only rough locations for endangered species.
- The service role key never goes in the mobile app or browser code.
- Public web reads use `species_public` and `records_public`; do not grant public
  access to the base tables because they contain exact coordinates.
- `004_security_hardening.sql` restricts writes by profile role and prevents
  signup metadata from selecting a privileged role.
- `005_rbac_finalization.sql` is the current follow-up migration for IoT and
  botanical photo policies. Apply migrations in numeric order.

Canonical profile roles are `visitor`, `botanist`, `conservation_officer`, and
`admin`. Keep these values in sync with the web and mobile clients; do not use
`researcher` or `officer` as database role values.
