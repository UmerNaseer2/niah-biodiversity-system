# Item 4: role-based access control verification

The canonical application roles are:

| Role | Purpose |
| --- | --- |
| `visitor` | Public access; no staff dashboard or exact coordinates |
| `botanist` | Submit field records and upload botanical photos |
| `conservation_officer` | Review records, manage species, access exact staff data and IoT telemetry |
| `admin` | Administrative and staff-management access |

## Migrations

Apply these migrations in order in the Supabase SQL Editor:

1. `001_initial_schema.sql`
2. `002_seed_data.sql`
3. `003_profiles_read_own.sql`
4. `004_security_hardening.sql`
5. `005_rbac_finalization.sql`

`005_rbac_finalization.sql` removes the broad IoT write policy and limits
botanical photo uploads to field roles. Public photos remain readable because
the current bucket is intentionally configured for public plant pages.

## Verification matrix

Run each check with a Supabase user whose `profiles.role` is the role in the
first column. Use the browser REST/API client or the Supabase SQL Editor with
the corresponding user session.

| Role | Operation | Expected |
| --- | --- | --- |
| anonymous | Read `species_public` | Allowed |
| anonymous | Read `records_public` | Allowed; only published records and rough GPS |
| anonymous | Read `species.coordinates_exact` | Denied/not exposed |
| visitor | Open `/dashboard` | Redirected or shown “No access” |
| botanist | Insert a `records` row | Allowed |
| botanist | Update a `records` row | Denied |
| botanist | Insert a species | Denied |
| botanist | Upload to `botanical-photos` | Allowed |
| conservation_officer | Update a `records` row | Allowed |
| conservation_officer | Manage `species` | Allowed |
| conservation_officer | Read `records_staff` and IoT telemetry | Allowed |
| admin | Manage `species` and IoT nodes | Allowed |

## Application checks

From `web/`:

```text
npm run lint
npm run build
```

The deployed web checks should also cover:

- signed-out `/dashboard` redirects to `/login`;
- a botanist can sign in but receives “No access”;
- a conservation officer reaches the dashboard;
- an admin reaches the dashboard;
- a user without a profile receives “No access”;
- sign-out returns to `/login`;
- a public plant page remains accessible while signed out.

Role names in the demo UI now match the database values exactly. The UI is
read-only; invitations and role changes remain Supabase administrator tasks.
