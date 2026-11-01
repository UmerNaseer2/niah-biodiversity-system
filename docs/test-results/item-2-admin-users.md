# Item 2 test results: managing accounts on the website

Tested on 31 Oct 2026 on Umer's Mac (Node 22) on the `item-2-finish` branch, which builds on Andy's
`item-2-admin-users` branch. The hosted Supabase project is behind on the SQL files
(`supabase/README.md`), so the pages were tried against the Supabase stand-in in
`supabase/tests/stand-in.js`. It runs the same SQL, and now also answers the Supabase Auth requests
for inviting and deactivating.

## What it does

The Users and roles page (`/dashboard/users`) used to show made up people. Now it's real.

- **Administrators** see everyone with an account, their role, whether they're active, invited or
  deactivated, and when they last signed in. Someone who can sign in but has no profile gets their
  own row, so they can be spotted.
- **Conservation officers** only see what each role can do. The page doesn't send them anyone's
  name or email.
- **Changing a role** only needs the new role and a button. Making someone an administrator warns
  first and the button says so. You can't change your own role, so an administrator can't lock
  themselves out by mistake.
- **Inviting** takes an email, a name and a role. Supabase emails a link to `/welcome`, where they
  set a password. To send it again, invite the same email.
- **Deactivating** asks first. It takes the role back to visitor and then stops them signing in.
  **Reactivating** lets them sign in again, still as a visitor, so someone has to choose a role.
- **Send password link** is for anyone who is active, like someone who opened their invite but
  never set a password.

## How it's built

- Names, emails and roles are read and changed with the normal client, as the administrator who is
  signed in, so Row Level Security checks them. Andy's version read and changed them with the
  service role key, which skips those checks, so a mistake in the page could have shown everyone's
  email to anyone with a staff login.
- The service role key is only used in `web/src/lib/supabase/admin.ts`, on the server, and that file
  only gives out Supabase Auth, so it can't be used on a table by mistake. Auth is what can't be
  done any other way: inviting, deactivating and listing accounts.
- Every action checks for an administrator itself, because anyone can send a request straight to a
  server action.
- Without the key the page still works. Roles can be changed, and a note says what else needs it.

## Website checks by hand

Stand-in, Chrome at 1024 px unless it says otherwise.

| # | Check | Result |
| --- | --- | --- |
| 1 | Administrator sees everyone, their state and last sign in | Pass |
| 2 | Own row has no role select, deactivate or password link | Pass |
| 3 | Account with no profile shows "No profile" and no role select | Pass |
| 4 | Change a role. Button appears only after choosing a new role, and the new role is still there after the page updates | Pass |
| 5 | Choose Administrator. Warning shows, button says "Make administrator", Cancel goes back | Pass |
| 6 | Keyboard focus moves back to the person after a change, and the result is announced | Pass |
| 7 | Invite with an email that isn't one | "That doesn’t look like an email." and nothing sent |
| 8 | Invite an email that already has an account | Says so and points to the role list or the password link |
| 9 | Invite a new person as a conservation officer | Email sent, row shows Invited with the right role |
| 10 | Choose Administrator on the invite form | Warning shows, button says "Invite as administrator" |
| 11 | Open an invite link that's been used | "This link has run out or has been used." |
| 12 | Send a password link, open it, password too short, then two that differ | Each says what's wrong and nothing is saved |
| 13 | Set a password, then sign in with it | Pass, and it opens the dashboard with the right role |
| 14 | The token is gone from the address after opening the link | Pass |
| 15 | Conservation officer opens the page | Roles table only, no emails anywhere in the page's HTML |
| 16 | Conservation officer sends all four actions by hand | "Only administrators can manage accounts." each time, and nothing changed |
| 17 | Deactivate, then Keep account | Nothing changes, and focus goes back to the button |
| 18 | Deactivate, then confirm | Row shows Deactivated and Visitor |
| 19 | Sign in as someone deactivated | Refused with the same message as a wrong password |
| 20 | Reactivate | Row shows Active and Visitor, and the message says to choose a role |
| 21 | Server with no service role key | Note shows, roles still change, invite form is turned off |
| 22 | 375 px | Rows stack, no sideways scrolling |

A bug showed up in check 12. React runs effects twice in development, and the second run found the
address already cleared, so the page said the link was missing. It now only reads the link once.

## Automatic checks

| Check | Command | Result |
| --- | --- | --- |
| SQL and stand-in tests | `cd supabase/tests && npm test` | 249 pass, 8 of them new for inviting and deactivating |
| Website lint | `cd web && npm run lint` | Pass |
| Website types | `cd web && npx tsc --noEmit` | Pass |
| Website build | `cd web && npm run build` | Pass |

## Not tested yet

- A real email. The stand-in writes the link to its log instead of sending anything.
- The hosted project. It needs `SUPABASE_SERVICE_ROLE_KEY` on the server, `/welcome` added to the
  Auth redirect URLs, and probably custom SMTP, because Supabase's default email limits are low.
- Signing in on the phone, which comes with item 10.

## Known limits

- **Fixed on 31 Oct:** role changes are logged now, with who made them and when (SQL 021).
- There's no deleting an account on the page. Deactivate keeps their records' names, and deleting
  is still done in the Supabase dashboard.
- **Fixed on 31 Oct:** the database now refuses to remove the last administrator (SQL 021). Two
  administrators doing it at the same moment on real connections hasn't been tried, because the
  tests run on one connection.
- **Fixed on 1 Nov:** "Last signed in" was showing UTC, 8 hours behind every other time on the
  website. It uses park time now.
- Deactivating takes the role away straight away, but someone already signed in keeps their login
  until it runs out. They only get what a visitor can see in that time.
