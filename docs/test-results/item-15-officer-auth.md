# Item 15 test results: conservation officer sign in (web)

Two rounds so far. Round 1 was on 15 Oct 2026 against a test Supabase project. Round 2 was on 16
Oct 2026 against a stand-in for Supabase on Umer's Mac. It added a role check to every staff page
and ran the tests round 1 didn't get to, so all 17 browser tests have passed now.

## Round 2: 16 Oct 2026, a role check on every page

Run on Umer's Mac (macOS, Node 22.22.3) on `main`. The hosted project doesn't have 003 to 007 yet,
so this round used the Supabase stand-in in `supabase/tests/stand-in.js` instead. It builds the
same database as the SQL tests, with our SQL files in order, adds a made up test account for each
role, and answers the parts of the Supabase API the website uses. Every request runs as the anon or
authenticated role with the user's ID, like the real API, so our Row Level Security policies
decide what each account gets. The website was a production build (`npm run build`, then
`npm run start`) pointed at it.

Jason's item 23 changes reached `main` while this round was running. Since then a production build
only takes an https project URL, so it treats the stand-in's http URL as not set up (B7), and the
stand-in only works with `npm run dev`. So after merging item 23, B1 to B5 ran again on
`npm run dev`, along with a sign in and sign out through the form (B8) and in a browser.

### What changed since round 1

- **A role check on every staff page.** The species pages got `requireStaff()` in item 14, and now
  the overview, review queue, reports, sensors and users pages have it too. Next renders a page and
  its layout at the same time, so the "No access" page from `dashboard/layout.tsx` didn't stop the
  page's own data. A signed in botanist saw "No access", but the mock records for that page still
  came down in the page data. Now those pages send nothing to an account without access.
- **The "No access" page** says "signed in as a botanist" and "as an administrator", with the right
  a or an. It used to say "as botanist".
- **A failed sign in keeps the email** in its box. React clears a form when its action finishes, so
  the sign in action sends the email back with the error and the form fills it in again.
- **Text.** The users page doesn't mark a made up person as "(you)" any more, `/screens` says who
  can open the dashboard, and the sign in page's description says it's for conservation officers
  and administrators.
- **The stand-in.** `npm run stand-in` in `supabase/tests` starts it on port 54321, and
  `stand-in.test.js` (38 tests) checks it answers like Supabase does. The
  [web README](../../web/README.md) says how to run the website against it.

### Automated checks

| Check | Command | Result |
| --- | --- | --- |
| SQL and stand-in tests, from `supabase/tests/` | `npm test` | Pass, 131 tests in 27 groups (item 14 had 93 in 19, and the stand-in adds 38 in 8) |
| Website lint, from `web/` | `npm run lint` | Pass |
| Website types, from `web/` | `npx next typegen`, then `npx tsc --noEmit` | Pass. The website has no typecheck script, and the build checks types too |
| Website build, from `web/` | `npm run build` | Pass, with the stand-in's values and with no values at all |

All four ran again with item 23 merged, with the same results.

### Checked on the stand-in

Requests from a script. "Page data" is what Next sends when you click a link inside the site (a
request with the `RSC: 1` header) instead of loading a whole page. B1 to B6 first ran against the
production build. With item 23 merged, B1 to B5 ran again on `npm run dev` and B6 on a production
build, all with the same results, and B7 and B8 were added.

| # | What we did | What should happen | Result |
| --- | --- | --- | --- |
| B1 | Opened all 9 dashboard pages signed out, as a page and as page data | 307 to `/login` every time | Pass |
| B2 | The same as the officer and the admin | 200 with the page's own content, the person's name and role, and no "No access" | Pass |
| B3 | The same as the botanist, the researcher, the visitor and the account with no profile | 200 with "No access" and their email, and nothing from any staff page in the HTML or the page data | Pass |
| B4 | Signed in as the officer with sign ins that last 100 seconds (`STAND_IN_TOKEN_SECONDS=100`), then opened `/dashboard` at 0, 11 and 22 seconds | Nothing refreshes at 0. At 11 and 22 seconds the session has under 90 seconds left, so the proxy refreshes it once, sends the new cookie, and the dashboard opens | Pass |
| B5 | Then sent the cookie from the first sign in again | Like Supabase, the stand-in lets an old refresh token be used again for 10 seconds, and after that ends the whole session. The old and the new cookie both go to `/login` | Pass |
| B6 | Built the site with no Supabase values and ran it (test 17) | All 9 dashboard pages go to `/login`, as a page and as page data. `/login` says sign in isn't set up, with both boxes and the button greyed out. Posting the form anyway gets "Sign in isn't set up on this server yet." and no cookie | Pass, 37 checks |
| B7 | With item 23 merged, built the site with the stand-in's values and ran it | `/login` says sign in isn't set up, because the URL isn't https. `/dashboard`, `/dashboard/species` and `/dashboard/users` go to `/login`, the home page opens, and `/login` has the item 23 headers (HSTS, nosniff, frames denied and the referrer policy) | Pass, 10 checks |
| B8 | On `npm run dev`, posted the real sign in form the way a browser without JavaScript does: a wrong password, an email with no account, both boxes empty, then the officer's password, then Sign out | The same message for the first two, with the email kept and no cookie. "Enter your email and password." for empty boxes. Then a cookie and `/dashboard` with "Good morning, Aina". Sign out goes to `/login` and clears the cookie, and the old cookie doesn't open the dashboard | Pass, 16 checks |

B1 to B3 are 126 requests: 9 pages, each as a page and as page data, signed out and as each of
the 6 accounts.

### The round 1 tests again

The same 17 tests in a browser, with the stand-in's test accounts (`officer`, `admin`, `botanist`
and `noprofile`, all `@example.test`).

| # | What we did | Round 2 result |
| --- | --- | --- |
| 1 | Opened `/dashboard` while signed out | Pass, and B1 checks every page |
| 2 | Pressed Sign in with both boxes empty | Pass |
| 3 | Right email, wrong password | Pass, and the email stays in its box |
| 4 | Email that has no account | Pass, the same message as test 3 |
| 5 | Signed in as the botanist | Pass. "No access", "signed in as a botanist", and no staff data |
| 6 | Pressed Sign out on "No access" | Pass |
| 7 | Signed in as the officer | Pass. The sidebar shows "Aina Officer" and "Conservation officer" |
| 8 | Looked at the greeting | Pass, "Good morning, Aina" |
| 9 | Opened the dashboard pages | Pass, all 9 pages as the officer and the admin (B2) |
| 10 | Refreshed the page, and opened the dashboard in a second tab | Pass, still signed in |
| 11 | Pressed Sign out in the sidebar | Pass |
| 12 | Pressed the browser's back button | Pass, no staff page is shown |
| 13 | Signed in as the admin | Pass. Opens the dashboard, and the sidebar says "Administrator" |
| 14 | Signed in with the account that has no row in `profiles` | Pass. "No access" without a role, and no crash |
| 15 | 375 px wide: `/login`, "No access" and the dashboard top bar | Pass, nothing scrolls sideways on any of them |
| 16 | Watched the browser console on every step | Pass. Nothing in the console, and no errors in the server log |
| 17 | No Supabase values | Pass (B6). Run on a build with the values left out, instead of editing `.env.local` |

These ran on the production build before item 23 was merged. With it merged, signing in as the
officer in a browser on `npm run dev`, opening four dashboard pages and signing out passed too,
with nothing in the console apart from the usual dev messages.

### Not tested yet

| What | Why | Next step |
| --- | --- | --- |
| The hosted project | It doesn't have 003 to 007 yet. Without 003 the website can't read anyone's role, so every account gets "No access" | Run 003 to 007 in order (see [supabase/README.md](../../supabase/README.md)). Then add an officer and an admin test account (Authentication, Users, Add user, with "Auto confirm"), set their `role` in `profiles` in the Table Editor, and repeat tests 3 to 14 on a production build, since the stand-in can't test one after item 23 |
| Real phones | 375 px was only checked in a desktop browser | Try `/login` and the dashboard in Safari on an iPhone and Chrome on an Android phone |
| Password reset, invites and turning an account off | Not part of this item. An administrator makes the accounts | Item 2 |
| Team check | Round 2 went straight to `main` | Angel and Andy to read the changes and try them against the stand-in |

### Security check

`npm audit` on 16 Oct 2026. No new packages in this round. The website has nothing in the packages
it runs on (`--omit=dev`), and the same 5 high in dev tools as before (the one `braces` advisory
through ESLint). The SQL tests and the stand-in have none. Don't run `npm audit fix --force`.

How sign in is protected now:

- **Three checks.** The proxy (`src/proxy.ts`) sends anyone without a session from `/dashboard` to
  `/login`. Then every dashboard page and every species server action asks Supabase who is signed
  in (`getUser()`, not just whether there's a cookie) and reads their role, and only conservation
  officers and administrators get any staff data. Then our SQL files (004, 006 and 007) check the
  role again in the database, so going around the website to the API doesn't give anyone more.
- **A new account is always a visitor**, and only an admin can change someone's role (006).
  Accounts are made by an administrator, so keep "Allow new users to sign up" off in Supabase
  (Authentication, Sign In / Providers).
- **One message** for a wrong email and a wrong password, so sign in can't be used to find out
  which emails have accounts.
- **Keys.** The website only uses the project URL and the anon key, from `.env.local`, which git
  ignores. The service role key isn't used anywhere. The stand-in's anon key and test password are
  made up and only work on the stand-in, which only listens on 127.0.0.1, so other computers can't
  reach it.
- **Exact points.** The review queue, reports and overview still send exact points to staff, so the
  reports CSV should be built on the server (item 21).
- **https and headers (item 23).** A production build won't use a project URL that isn't https,
  and every page gets security headers, including HSTS in production and frames denied.

## Round 1: 15 Oct 2026, sign in on a test project

Run on Deangel's Victus (Windows 11, Node 24.21.0), on the `item-15-officer-auth` branch, against a
test Supabase project made for this.

### What this item adds

- A real staff sign in page (`/login`) using Supabase Auth with email and password.
- `src/proxy.ts` sends anyone who isn't signed in from `/dashboard` to `/login`.
- `getSession()` in `src/lib/auth.ts` reads the signed in user's role from the `profiles` table.
  Only `conservation_officer` and `admin` can open the dashboard. Everyone else sees "No access".
- The dashboard sidebar and the overview greeting show the real user, and Sign out ends the session.

### Automated checks

Run from `web/`. GitHub runs lint and the build on every pull request.

| Check | Command | Result |
| --- | --- | --- |
| Website lint | `npm run lint` | Pass |
| Website build | `npm run build` | Pass. `/dashboard` pages are behind the proxy, which the build lists as "Proxy (Middleware)" |

There are no unit tests for the website yet, so sign in was tested by hand below.

### Checked against a production build (no Supabase user needed)

`npm run build`, then `npx next start`, then `curl` with no cookies.

| # | What we did | What should happen | Result |
| --- | --- | --- | --- |
| A1 | Requested `/dashboard` | 307 redirect to `/login` | Pass |
| A2 | Requested `/dashboard/users` | 307 redirect to `/login` | Pass |
| A3 | Requested `/login` | 200, with an email and a password field | Pass |
| A4 | Requested `/plants` (public) | 200, not redirected | Pass |

### Manual tests in the browser

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
| 13 | Admin | Set a test user to `admin` and signed in | Opens the dashboard | Not run |
| 14 | Profile missing | Signed in with a user that has no row in `profiles` | "No access", no crash | Not run |
| 15 | Small screen | Window 375 px wide: `/login`, "No access" and the dashboard top bar with Sign out | Nothing scrolls sideways | Partial: `/login` at 375 px has no sideways scroll. "No access" and the dashboard top bar not checked yet |
| 16 | Console | Watched the browser console on every step above | No errors | Partial: only `/login` was watched, and it showed just dev server hot reload messages. The other steps were not watched |
| 17 | Not set up | Removed the Supabase values from `.env.local` and restarted | `/login` says sign in isn't set up and the boxes are greyed out. `/dashboard` still redirects to `/login` | Not run |

Round 2 ran tests 13, 14 and 17, finished 7, 15 and 16, and checked sessions running out.

### Security check

`npm audit` in `web/` on 15 Oct 2026 after adding `@supabase/ssr` and `@supabase/supabase-js`.

**Packages the site runs on** (`npm audit --omit=dev`): nothing found.

**Dev tools:** the same 5 high that the item 13 results describe (one `braces` advisory counted
once per package in the ESLint chain). The two Supabase packages added nothing. Don't run
`npm audit fix --force`.

- Only the public anon key is used. The service role key is not used anywhere in this item.
- The error message for a wrong email and a wrong password is the same on purpose.
- We turned off "Allow new users to sign up" in the test project, since an administrator makes the
  accounts.

Round 2's security check has the rules our SQL files and the website use now.

### Fixed while testing

1. The officer signed in but saw "No access" with no role. `001_initial_schema.sql` turns on Row
   Level Security for `profiles` but has no policy for it, so the website couldn't read the user's
   own role. Added `supabase/003_profiles_read_own.sql`, which lets a signed in user read only
   their own row.
