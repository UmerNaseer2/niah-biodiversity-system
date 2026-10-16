# Item 2 test results: user authentication and authorisation

Checked on 16 Oct 2026 on Umer's Mac (macOS, Node 22.22.3), on `main`.

Item 2 is spread over a few other items, so this page says where each part lives and where it was
tested. The rules are in our SQL files in `supabase/`, and the hosted project only has them once
003 to 007 are run there.

## What Sprint 1 covers

| Part | How it works | Tested in |
| --- | --- | --- |
| Accounts | Supabase Auth with email and password. There's no sign up page, and "Allow new users to sign up" stays off, so only an administrator adds people | [Item 15](item-15-officer-auth.md) |
| Roles | Each account has one role in `profiles`: visitor, researcher, botanist, conservation officer or administrator | [Item 4](item-4-access-control.md) |
| New accounts | Always start as a visitor, whatever the sign up request sends | `roles.test.js` |
| Changing roles | Only an administrator can change a role, and never their own | `roles.test.js` |
| Website sign in | Only conservation officers and administrators get into the dashboard. Every staff page checks the role on the server before it loads anything | [Item 15](item-15-officer-auth.md) |
| What each role can see | Row Level Security on every table, and the public only reads the `_public` views | [Item 4](item-4-access-control.md) |

[database-design.md](../architecture/database-design.md) has the tables and views.

## Automated checks

| Check | Command | Result |
| --- | --- | --- |
| SQL tests | `cd supabase/tests && npm test` | Pass, 131 tests. They run our SQL files from 001 to 007 on a throwaway Postgres (PGlite) and act as each role |
| Website lint | `npm run lint` | Pass |
| Website types | `npx next typegen && npx tsc --noEmit` | Pass |
| Website build | `npm run build` with no Supabase values | Pass, and the dashboard sends you to `/login` (37 checks) |

## Managing accounts in Sprint 1

Inviting someone needs the service role key, which must never be in the website or the phone app.
So for now an administrator does it in the Supabase dashboard:

1. Authentication, Users, Add user, Send invitation. The new account starts as a visitor.
2. Table Editor, `profiles`, and set their `role`.
3. To take someone's access away, set their role back to `visitor`. They can still sign in, but
   the dashboard says "No access" and Row Level Security treats them like any other visitor.
   Delete the account under Authentication, Users once they've left.

The Users and roles page on the website shows made up accounts and has tape saying the real
screen is planned for Sprint 2.

## Not tested yet

| What | Why | Next step |
| --- | --- | --- |
| Invite email on the hosted project | We don't sign in to the hosted project from Umer's Mac | Umer invites a test account, then checks it starts as a visitor and gets "No access" |
| Signing in on the phone | The phone only needs an account once it uploads records, which is item 10 (Sprint 2) | Add it with item 10, using the same Supabase accounts |
| Users and roles screen on the website | Moved to Sprint 2 | List real accounts and change roles there, using the 006 rules that already let only admins do it |
