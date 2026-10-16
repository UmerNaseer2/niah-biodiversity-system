# Supabase

The database tables, Row Level Security policies, Storage buckets and seed data, as numbered
`.sql` files, so the whole team can see and review every change to the database.

## Running the SQL files

Run them in the Supabase SQL editor (SQL Editor, New query, paste the whole file, Run), in this
order. The SQL editor runs a whole file as one transaction, so if a file fails, nothing from it is
kept, and you can fix the problem and run it again.

| File | What it does | Item | Safe to run again? |
| --- | --- | --- | --- |
| `001_initial_schema.sql` | The tables (profiles, species, records, iot_nodes), Row Level Security, and the public `botanical-photos` bucket | 14 | No, it stops on the policies that are already there |
| `002_seed_data.sql` | The species and the sample records | 14 | Yes |
| `003_profiles_read_own.sql` | Lets a signed in user read their own profile, so the website can see their role | 15 | Yes |
| `004_security_hardening.sql` | Role checks on writes, the public views and the staff views | 4, 14, 15, 16 | No, it stops on the policies that are already there |
| `005_phone_sync.sql` | Lets the phone upload records, and adds the private `record-photos` bucket | 3 | No, it stops on its first line and changes nothing |
| `006_role_based_access.sql` | What each role can read and change, checked by the database: Row Level Security, column grants and a review trigger | 4 | Yes |

As of 16 Oct 2026 the hosted project has 001 and 002. Run 003, 004, 005 and 006 next, one file
at a time, in that order. Don't stop after 004, because the website's species edit and delete
need 006 as well. 003 is fine to run even if it turns out to be there already.

If 005 stops with a check error (like `records_gps_check`), a record already on the hosted project
breaks one of its new rules. Fix or delete that record in the Table Editor and run 005 again.

## Keys

The website and the app need the project URL and the anon key (Supabase calls it the publishable
key now). Ask Umer for them, then:

- website: copy `web/.env.example` to `web/.env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- app: copy `mobile/.env.example` to `mobile/.env` and fill in `EXPO_PUBLIC_SUPABASE_URL` and
  `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Git ignores both files. Never commit them, and never paste a key into an issue or a pull request.
The anon key is fine in an app, because Row Level Security decides what it can do. The service
role key skips Row Level Security, so it never goes in the app, the website's browser code or git.

## Rules from our design

- Row Level Security is on for every table.
- The public reads through `species_public` and `records_public`, never the tables themselves,
  because the records table has exact locations. Only published records show in
  `records_public`, and only a plant that's Least Concern or Near Threatened and isn't protected
  in Sarawak shows its exact spot there. Every other plant shows the middle of its 0.004 degree
  grid square (about 440 m at Niah).
- The server decides who uploaded a record and its status, never the phone. See
  [docs/sync-design.md](../docs/sync-design.md).
- A new account is always a visitor, whatever was sent when signing up. Only an admin can change
  someone's role, and never their own.
- Only officers and admins review records. The `fill_in_review` trigger fills in who reviewed a
  record and when, so nobody can review in someone else's name.
- Record photos go in the private `record-photos` bucket, never the public `botanical-photos` one.
- Supabase gives `anon` and `authenticated` every privilege on a new table. Revoke them first,
  then grant only what each role needs, and let Row Level Security pick the rows.
- Never edit a file that's been run on the hosted project, because nobody will run it again. Add
  a new numbered file instead, then add it to the table above and to `SQL_FILES` in
  `tests/harness.js`.

## Tests

`tests/` runs our SQL files in order on PGlite (Postgres built for WebAssembly), then acts as each
kind of user to check what they can and can't do. It needs Node 22, and no Supabase project or
keys.

```bash
cd supabase/tests
npm install
npm test
```

- `tests/sync.test.js` checks phone uploads and record photos (item 3), and `tests/roles.test.js`
  checks what each role can read and change (item 4).
- PGlite runs Postgres 18.3 and Supabase projects run 15 or 17, so don't use anything newer than
  Postgres 15 in our SQL.
- `tests/supabase-stub.sql` stands in for the parts of Supabase our SQL uses (the API roles,
  `auth.uid()` and the Storage tables). If a new file uses another part of Supabase, add it there.
- PGlite doesn't have PostGIS, so the tests take the `postgis` line out of 001. Nothing uses it
  yet.
- `tests/fixtures/phone-upload.json` is shared with the mobile tests, so the phone and the server
  are tested against the same records.
- GitHub runs these tests on every pull request and every push to `main` (the Database job).
