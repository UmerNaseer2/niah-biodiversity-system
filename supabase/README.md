# Supabase

Database schema, Row Level Security policies and migrations go here as `.sql` files, so the whole team can see and review every change to the database.

Name migrations with a number and what they do, for example `001_plants_table.sql`, `002_rls_policies.sql`.

Rules from our design:

- Row Level Security is turned on for every table.
- Public users only see approved records, and only rough locations for endangered species.
- The service role key never goes in the mobile app or browser code.
