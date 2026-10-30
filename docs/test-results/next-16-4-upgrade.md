# Next.js upgrade test results: 16.3.8 to 16.4.3

Round 1 was on 29 Oct 2026 on Umer's Mac (macOS, Node 22.22.3) on the `next-16-4-upgrade` branch.
The pages were tried against the Supabase stand-in in `supabase/tests/stand-in.js` (see
`web/README.md`), with the stand-in's own sample records and test accounts, not the hosted project.

## What changed

- `next` and `eslint-config-next` went from 16.3.8 to 16.4.3, the newest release (out on 23 Oct
  2026). Both are still pinned to an exact version in `web/package.json`, like before.
- `npm audit fix` (without `--force`) then moved `zod` from 4.6.5 to 4.6.7. Only ESLint uses it,
  through `eslint-config-next` and `eslint-plugin-react-hooks`, so it never reaches the site.
- Nothing else changed. No packages were added or removed, and no code had to change. React
  19.2.8 is still inside the React versions Next 16.4.3 works with.

## Why

`npm audit` marked `next` 16.3.8 as critical, for three advisories that cover every 16.x version up
to 16.4.0:

| Advisory | The problem | Does our site use it? |
| --- | --- | --- |
| [GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw) | Someone who isn't signed in could run code on the server through the image optimizer, using SVG files | We don't use `next/image` (photos are plain `<img>` tags), but Next still answers on `/_next/image`, so we updated rather than guess |
| [GHSA-p3m5-59mp-jv5r](https://github.com/advisories/GHSA-p3m5-59mp-jv5r) | Requests to Server Actions could tie up the server so it stops answering | Yes. Sign in and every dashboard form are Server Actions |
| [GHSA-673q-mjm6-r5xr](https://github.com/advisories/GHSA-673q-mjm6-r5xr) | Someone who isn't signed in could run code on the server through `use cache` functions that return typed arrays | No, nothing uses `use cache` |

Whoever deploys the site should build it from `main` after this change, so it never goes live on
16.3.8.

## Automated checks

| Check | Command | Result |
| --- | --- | --- |
| Website lint | `cd web && npm run lint` | Pass |
| Types | `cd web && npx tsc --noEmit` | Pass |
| Build | `cd web && npm run build` | Pass. Next prints 16.4.3 and builds all 22 routes. The only warnings are the two font ones that `web/README.md` already explains |

The website has no unit tests yet. Nothing in the database or the phone app changed, so their tests
weren't run.

## Manual tests (stand-in)

The site ran with `npm run dev` on 16.4.3. A throwaway script signed in through the real login
form, the way a browser without JavaScript would, then loaded each page. It only printed status
codes and headings.

| Test | Result |
| --- | --- |
| Signed out: `/`, `/plants`, a plant page, `/login`, `/tag` and `/screens` all give 200 | Pass |
| Signed out: `/dashboard` and `/dashboard/records` send a 307 to `/login` | Pass |
| Signing in as the test officer through the login form (a Server Action) gives a 303 to `/dashboard` and a session cookie. A wrong password stays on the page with no cookie | Pass |
| Test officer: every dashboard page (home, records, a record's edit page, reports, review queue, sensors, species, a species edit page, new species, users and roles) gives 200 with the right heading | Pass |
| Test officer: the CSV download gives 200 with a header row and 8 records | Pass |
| Re-saving the Belian species unchanged through its edit form (a Server Action that writes) says "Changes saved", and its public page still loads | Pass |
| Test admin: users and roles gives 200 | Pass |
| Test visitor: the dashboard says No access, and the CSV route gives 403 | Pass |
| Tag lookups: a published tag gives 200, a lower case code redirects to the upper case one, and a record that isn't published or a code that doesn't exist gives 404 | Pass |
| In the browser: searching the plants list for "Belian" filters it to 1 of 7, and a plant page loads its photo | Pass |
| No errors in the browser console or the dev server log | Pass |

## Security check

`npm audit` in `web/` on 29 Oct 2026.

| | Before (16.3.8) | After 16.4.3 only | After 16.4.3 and `npm audit fix` |
| --- | --- | --- | --- |
| `npm audit` | 2: 1 critical (`next`), 1 high (`zod`) | 1 high (`zod`) | 0 |
| `npm audit --omit=dev` | 1 critical (`next`) | 0 | 0 |

The `zod` one ([GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)) lets very
big inputs use up memory. It was only ever in ESLint, but the fix is a patch release in the same
4.6 line, so it went in too.

If an advisory comes back, still don't run `npm audit fix --force`. On this site it has offered to
swap `eslint-config-next` for an old version made for Next 14 (see the
[item 13 results](item-13-web-wireframe.md#security-check)). Check again after each Next update.

## Not tested yet

- A production build running against the stand-in. The stand-in's URL is http, so a production
  build says sign in isn't set up (see `web/README.md`). The build itself passed.
- The hosted Supabase project, which needs 003 to 009 run first.
- A deployed copy of the site. Nothing was deployed in this round.
- Uploading a species photo, and the record edit, delete and review forms. They're Server Actions
  like the species form, which worked, but they weren't tried one by one.
- Safari and Firefox. The browser checks only used one Chromium based browser.
