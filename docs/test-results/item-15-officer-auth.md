# Item 15 test results: conservation officer sign in (web)

Run on 15 October 2026 on Deangel's Victus (Windows 11, Node 24.21.0), on the
`item-15-officer-auth` branch, against a test Supabase project made for this.
The implementation is maintained on the authentication/RBAC finalization
branch and uses the canonical `conservation_officer` role name.

## What this item adds

- A real staff sign in page (`/login`) using Supabase Auth with email and password.
- `src/proxy.ts` sends anyone who isn't signed in from `/dashboard` to `/login`.
- `getSession()` in `src/lib/auth.ts` reads the signed in user's role from the `profiles` table.
  Only `conservation_officer` and `admin` can open the dashboard. Everyone else sees "No access".
- The dashboard sidebar and the overview greeting show the real user, and Sign out ends the session.

## Automated checks

Run from `web/`. GitHub runs lint and the build on every pull request.

| Check | Command | Result |
| --- | --- | --- |
| Website lint | `npm run lint` | Pass |
| Website build | `npm run build` | Pass. `/dashboard` pages are behind the proxy, which the build lists as "Proxy (Middleware)" |

There are no unit tests for the website yet, so sign in was tested by hand below.

## Checked against a production build (no Supabase user needed)

`npm run build`, then `npx next start`, then `curl` with no cookies.

| # | What we did | What should happen | Result |
| --- | --- | --- | --- |
| A1 | Requested `/dashboard` | 307 redirect to `/login` | Pass |
| A2 | Requested `/dashboard/users` | 307 redirect to `/login` | Pass |
| A3 | Requested `/login` | 200, with an email and a password field | Pass |
| A4 | Requested `/plants` (public) | 200, not redirected | Pass |

## Manual tests in the browser

Needs two test users in Supabase (Authentication, Users, "Auto confirm"). Their roles were set in
`profiles` with SQL. Test accounts only, never real staff emails or passwords in this file.

| Test user | Role in `profiles` |
| --- | --- |
| officer test account | `conservation_officer` |
| botanist test account | `botanist` |

| # | Screen | What we did | What should happen | Result |
| --- | --- | --- | --- | --- |
| 1 | Dashboard | Opened `/dashboard` while signed out | Goes to `/login` | Pass |
| 2 | Sign in | Pressed Sign in with both boxes empty | The browser asks for the email, nothing is sent | Pass |
| 3 | Sign in | Right email, wrong password | "That email and password don't match an account." in red, and you stay on `/login` | Pass |
| 4 | Sign in | Email that has no account | The same message as test 3, so it can't be used to find which emails exist | Pass |
| 5 | Sign in | Signed in as the botanist | Opens `/dashboard` but shows "No access" with the email and role, and no staff data | Pass |
| 6 | No access | Pressed Sign out | Goes to `/login`, and `/dashboard` redirects again | Pass |
| 7 | Sign in | Signed in as the officer | Opens `/dashboard`. The sidebar shows the test user's name and "Conservation officer" | Pass, after fix 1 (officer reached the dashboard; sidebar text not re-checked) |
| 8 | Overview | Looked at the greeting | "Good morning, <first name of the test user>" | Pass |
| 9 | Dashboard | Opened `/dashboard/review`, `/dashboard/species` and `/dashboard/users` | All open while signed in | Pass |
| 10 | Dashboard | Refreshed the page and closed and reopened the tab | Still signed in | Pass |
| 11 | Sign out | Pressed Sign out in the sidebar | Goes to `/login` | Pass |
| 12 | Sign out | Pressed the browser's back button | Goes back to `/login`, no staff page is shown | Pass |
| 13 | Admin | Set a test user to `admin` and signed in | Opens the dashboard | To run against deployed site |
| 14 | Profile missing | Signed in with a user that has no row in `profiles` | "No access", no crash | To run against deployed site |
| 15 | Small screen | Window 375 px wide: `/login`, "No access" and the dashboard top bar with Sign out | Nothing scrolls sideways | Partial: `/login` at 375 px has no sideways scroll. "No access" and the dashboard top bar not checked yet |
| 16 | Console | Watched the browser console on every step above | No errors | Partial: only `/login` was watched, and it showed just dev server hot reload messages. The other steps were not watched |
| 17 | Not set up | Removed the Supabase values from `.env.local` and restarted | `/login` says sign in isn't set up and the boxes are greyed out. `/dashboard` still redirects to `/login` | Not run |

## Security check

`npm audit` in `web/` on 15 Oct 2026 after adding `@supabase/ssr` and `@supabase/supabase-js`.

**Packages the site runs on** (`npm audit --omit=dev`): nothing found.

**Dev tools:** the same 5 high that the item 13 results describe (one `braces` advisory counted
once per package in the ESLint chain). The two Supabase packages added nothing. Don't run
`npm audit fix --force`.

- The proxy is only the first gate. The role check is in `dashboard/layout.tsx` through
  `getSession()`, which asks Supabase who the user is on the server (`getUser()`), not just
  whether a cookie exists.
- Only the public anon key is used. The service role key is not used anywhere in this item.
- The error message for a wrong email and a wrong password is the same on purpose.
- Page level checks aren't enough on their own. The database rules (Row Level Security) from item 14
  allow any signed in user to change species and review records. That's item 4, and it needs
  fixing before real data goes in. A botanist who can't open the dashboard can still call the API
  directly until then.
- The signup trigger in `001_initial_schema.sql` copies `role` from the new user's metadata, so with
  public sign ups on, anyone could sign up as an `admin`. We turned off "Allow new users to sign
  up" in the test project. Andy's schema should ignore the role from metadata, and the team's
  project needs the same setting.
- The staff pages still send exact plant points to the browser. That's now behind a sign in and a
  role check, but the reports CSV should still be built on the server (item 21).

## Not tested yet

| What | Why | Next step |
| --- | --- | --- |
| Row Level Security | Database verification is tracked separately | Run the matrix in [item-4-rbac.md](item-4-rbac.md) after applying `005_rbac_finalization.sql` |
| Password reset, sign up, invites | Not part of this item. Accounts are made by an administrator | Item 4 and Sprint #2 |
| Admin and no profile (tests 13 and 14), unconfigured server (test 17) | Not run in this round | Run them before Sprint #2 |
| Expired sessions | The session cookie is refreshed by the proxy, but we didn't wait for a token to expire | Check after an hour of idle time |
| Real phones | 375 px was only tested in a desktop browser | Try Safari on an iPhone and Chrome on an Android phone |
| Team check | One other teammate has to approve the pull request | Ask for a review |

## Fixed while testing

1. The officer signed in but saw "No access" with no role. `001_initial_schema.sql` turns on Row Level
   Security for `profiles` but has no policy for it, so the website couldn't read the user's own
   role. Added `supabase/003_profiles_read_own.sql`, which lets a signed in user read only their own
   row. Andy's item 14 schema needs the same policy.
