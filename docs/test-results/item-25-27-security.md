# Items 25 to 27 test results: pen test, fixes and reassessment

Tested on 31 Oct 2026 on Umer's Mac (Node 22) on the `item-25-27-security` branch, cut from `main`
at 6921bb2. Nothing hosted was touched, there were no denial of service tests, and all the data was
made up. The repo is public, so this page says what ran and what came back, without steps to repeat.
The short version is in the [assessment summary](../security/assessment-summary.md).

**The hosted project doesn't have these fixes.** The SQL only reaches it once Umer runs 003 to 021
in order. Everything below is the production build against the stand-in, not the hosted project.

The website ran as a production build on port 3231, with the stand-in on port 54331. The stand-in
runs our real SQL on PGlite. `web/src/lib/supabase/config.ts` treats a Supabase URL that isn't https
as not set up in a production build, so the build reached the stand-in through a small https wrapper
on port 54332 with a certificate made for localhost. The wrapper isn't in the repo, and it can also
fail on purpose, which is how the outage tests ran. No `.env` file was copied.

## What changed

| Item | What |
| --- | --- |
| 25 | Ran the checks below on `main` and wrote down what came back |
| 26 | Fixed both highs, 5 of the 7 mediums and 5 of the 14 lows. New SQL: 019, 020 and 021, each with its own test file. The website fixes are in the commits on the branch |
| 27 | Ran the same scripts again on the fixed code and compared them line by line |

Commits only describe the holes in general terms. See the summary for what was fixed.

## Automated checks

Run at the end, on the final code.

| Check | Command | Result |
| --- | --- | --- |
| Database tests | `cd supabase/tests && npm test` | Pass, 406 of 406 in 75 suites. It was 362 in 66 suites before this round, so 44 are new. 14 in `public-details.test.js`, 13 in `record-photo-access.test.js`, 17 in `role-changes.test.js` |
| Types | `cd web && npx tsc --noEmit` | Pass |
| Website lint | `cd web && npm run lint` | Pass |
| Production build | `cd web && npm run build` | Pass |

## Packages

| Where | Command | Before | After |
| --- | --- | --- | --- |
| Website | `npm audit` | 16 moderate | 16 moderate, all one advisory in ESLint's `minimatch`, which only runs while developing |
| Website | `npm audit --omit=dev` | Not run on its own | 0 |
| SQL tests | `npm audit` | 0 | 0 |
| Phone | `npm audit` | 53 (6 low, 42 moderate, 5 high) | The same. No changes were made under `mobile/` |
| Phone | `npm audit --omit=dev` | Not run on its own | 38 (5 low, 28 moderate, 5 high) |

The branch changes no `package.json` or lockfile. The commit before `supabase-js` was added has the
same 53 and the same 5 highs, so item 10 didn't bring them in.

| Phone high | In the shipped bundle? | Reachable? |
| --- | --- | --- |
| `@expo/cli` | No, 0 sources | No, laptop only |
| `zod` | No, 0 sources | No, laptop only |
| `expo-router` | Yes | Only flagged through the two below |
| `query-string` | Yes | Only flagged through the one below |
| `decode-uri-component` | Yes, 1 source | Yes, through the links Expo Router handles. Logged as medium, for the phone work to fix. No data at risk |

## Secrets

| Check | Command | Result |
| --- | --- | --- |
| The two strings from our rules, tree | `git grep --untracked` | Pass, exit 1, nothing found |
| The two strings, history | `git log --all -S` | Pass, 0 commits each |
| Key shapes (JWT start, `sb_secret_` with a value, private key headers) | `git grep`, `git log -S` | Pass, 0 files and 0 commits |
| `SUPABASE_SERVICE_ROLE_KEY=` with a value, history | `git log -S` | 2 commits, the stand-in's own key in a doc and a placeholder. No real key |
| `.env` files and `secrets.h` ignored | `git check-ignore` | Pass, all 8 tried. Only the `.env.example` and `secrets.example.h` files are tracked |
| Website's built files, `web/.next/static` | `grep` | Pass, 0 files with the service key or its name |
| Phone bundle (1412 sources), from `npx expo export` | `grep` | Pass, 0 for the service role word, JWT start, private key and the stand-in's service key. `sb_secret_` shows once, which is `supabase-js`'s own prefix check |

## Roles, directly through the API

Every role (signed out, an account with no profile, visitor, researcher, botanist, officer, admin)
tried every table, view, function and bucket through the stand-in's REST and Storage API, not
through the website. The scripts were run before and after and the answers compared.

| Test | Before and after | Result |
| --- | --- | --- |
| The whole role matrix | 824 answers: 752 the same, 72 changed | Pass, every change was expected and nothing widened. The changes are the new `role_changes` table, which only admins can read and nobody can write through the API, and helper functions that now refuse |
| The scenarios on top of it: self promotion, bad roles, other people's records, hand-made uploads, IoT tokens | 100 answers: 92 the same, 8 changed | Pass, all 8 are gaps that closed |
| Server actions called directly with each role, signed out too | 266 answers: 263 the same, 3 changed | Pass. 2 are a random tag in a redirect, and 1 is the script wrongly reading the admin reports page as refused, fixed before the last run |
| Bad input and uploads sent straight to server actions and buckets | 92 answers: 91 the same, 1 changed | Pass. The script text test now really saves, and it's still shown escaped |

The answers after the fixes, in short:

| Test | Result |
| --- | --- |
| Records: signed out 401, non staff 0 rows, officer and admin all. Only officer and admin update or delete | Pass |
| Public views: anyone reads, nobody writes | Pass |
| Staff views: signed out 401, non staff 0 rows | Pass |
| `profiles`: own row only, admin sees all, only an admin changes a role and never their own | Pass |
| History, download log and role change tables: only the right role reads, nobody writes directly | Pass |
| IoT: `iot_devices` admin only, token hashes refused for everyone, readings and alerts read by officer and admin with no direct writes, alert limits changed by admin only | Pass |
| A device with a wrong token and an unknown device get the same answer, a turned off device is refused, a batch over 100 is refused | Pass |
| A device can't add readings for another device's node (in `iot.test.js`) | Pass |
| Storage: own folder only for field staff, wrong type 415, over size 413, public links into the private bucket 404, species photos officer and admin only | Pass |
| Users page actions: admin only. Other record, species, review and sensor actions: refused for the wrong roles | Pass |
| `refreshSensors` and `checkUrgentCount` run for any signed in role and return nothing | Noted, harmless |

## Approval before public, and hidden locations

Run on the fixed build, signed out, with 8 published rows (7 hidden, 1 exact) and records waiting
and rejected. 41 strings were searched for over 23 paths, as both HTML and the data Next.js sends
for page changes (44 answers 200, 2 answers 404).

| Test | Before | After | Result |
| --- | --- | --- | --- |
| Exact point of a hidden plant on any public page or map payload | 0 | 0 | Pass |
| Notes on any public page | 0 | 0 | Pass |
| Waiting or rejected record IDs on public pages, or in `records_public` | 0 | 0 | Pass |
| Time of day on hidden rows in the public view | 7 rows | 0 rows | Fixed |
| Hidden row placed between exact neighbours by the order | Yes | No | Fixed |
| Signed out API asking for exact columns | Refused | Refused | Pass |
| Record whose name disagrees with its link | Exact shown | Hidden on pages, API and CSV | Fixed |
| Same name with different capitals and spaces | Exact shown | Exact shown | Pass, a real record isn't caught by the new check |
| Plain CSV, published: Hidden rows with notes, with a time of day | 6, 7 | 0, 0 | Fixed |
| Plain CSV, all records: Hidden rows with notes, with a time of day | 6, 8 | 0, 0 | Fixed |
| Exact strings in the plain CSV | 0 | 0 | Pass |
| Exact CSV: officer and admin only, `private, no-store`, one line in the download log | Yes | Yes | Pass |

## Website on the production build

| Test | Result |
| --- | --- |
| Headers on 14 paths, including 404s and redirects: CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and new `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy` | Pass, none missing, no `X-Powered-By` |
| Login cookie in headless Chromium: HttpOnly, Secure, SameSite Lax, 12 hours, page scripts can't read it, still signed in after a reload | Pass. It was 400 days with no flags before |
| Token ran out: next page gets a new cookie with the same flags | Pass |
| Sign out: cookie gone, `/dashboard` goes to `/login` | Pass |
| 9 pages in Chromium: console errors, broken images | Pass, 0 and 0 |
| Bad input to server actions: wrong types, too long, bad IDs, script text | Pass, plain messages, and script text is shown escaped. Dates in years like 1800 and 3000 still save (Known limits) |
| CSV cells that start like a formula | Pass, escaped |
| Uploads: wrong type, HTML or SVG named as a photo, empty, too big, very large image, a path in the species link | Pass, all refused. A path in the file name is ignored, because the server picks the stored name. EXIF removed from species photos |
| Login and welcome pages with a link to another site in the URL | Pass, no redirect there, and the name isn't in the page. `//other-site` gives a redirect on our own site |
| Wrong login with a real and an unknown email | Pass, the same answer |
| Request from another site's Origin to a server action | Pass, Next.js refuses it. See Known limits for two cases a browser can't send |
| Outage, database down: error screen, not "No access". Actions say nothing was changed. CSV 503 | Fixed |
| Outage, everything down: error screen, sign in says it isn't working, staff data not shown | Fixed |
| Storage down: removing a photo says it couldn't, stays listed. Back up: removed and the link gives 404 | Fixed |
| Failed request on the record, species and photo forms: message, what was typed is kept, retry saves | Fixed |
| Login ran out while on a form: stays on the page, message, sign in in a new tab, the first tab saves | Fixed |
| No JavaScript: sign in, save a record, a bad height keeps its value, save a species, upload and remove a photo | Pass |
| Clearing About on a species: the public page stops showing it (5 cases) | Fixed |
| Users page: an admin's role change shows on the page and in the log. Officer reads 0 rows, signed out 401 | Fixed |
| Users page on a database without 021: page 200 with a note | Pass |
| Our own signed out script (not ZAP): 54 URLs, 0 source maps of 16 tried, no stack details, no HTML comments, 0 inline event handlers. `.env`, `.git`, `package.json` and SQL paths 404. Image optimiser refuses local and outside addresses | Pass |

## Checklists

Walked by hand against the results above, and the phone by reading its code only. The details are in
the private findings log.

| Checklist | Result |
| --- | --- |
| OWASP Top 10 | Findings in access control, cookies, misconfiguration, design, packages and logging, as in the summary. Nothing found for injection or server side request forgery. Hosted Auth settings not checked |
| ASVS (authentication, sessions, access, validation, errors, data, communication, business logic, files, API, configuration) | The same findings. Parts that depend on hosted settings or a deployed site not checked |
| MASVS (read only, no phone) | Session in the keychain for this device only, backups off, https only in the code, and the bundle has no secrets. Records file plain until SQLCipher. One package finding. No certificate pinning. Record photo EXIF to check when item 11 lands, since it isn't on `main` yet |

## Not tested yet

- **OWASP ZAP didn't run.** Docker Desktop wouldn't start on the Mac, and the Mac has no Java, so
  the image and the cross platform download both failed. No ZAP result exists, and the script above
  doesn't replace it.
- Anything on the hosted project: Security Advisor, Auth settings and real sign in limits.
- HTTPS on a real host and SSL Labs, because nothing is deployed.
- Two administrators changing roles at the same moment on real connections. PGlite has one
  connection and the Mac has no Postgres, so the tests check the refusal one after the other, and
  the lock is read from the SQL.
- Anything on a real phone or ESP32 for this round. The phone's numbers are from `npm audit`, the
  exported bundle and reading the code. The package finding was timed on the library in Node, not on
  a phone.
- Server action requests with no Origin or a matching forwarded host, on the real host (see Known
  limits).
- With a screen reader.

## Known limits

- **The stand-in isn't Supabase.** It allows any origin, turns down signups and refuses the service
  key except for sign in requests. Nothing here depends on these, but none of them tests the hosted
  answers.
- **A signed link made before someone loses their role works until it runs out.**
- **A cookie from before the fix** gets the new flags at its next refresh, and the 12 hours rolls
  while someone keeps using the site. Safari won't keep a Secure cookie on `http://localhost`, which
  only matters while developing.
- **Renaming a species in SQL hides its linked records** until they're corrected, because the name
  check fails closed. It looks at the scientific name only.
- **If a photo's file went but the list then fails to save,** a broken image shows until someone
  tries again, and trying again works.
- **A species with an empty About and an old description** gets that text copied into About on its
  next save.
- **Delete forms and the login form** don't keep what was typed when a request fails.
- **Rerunning 006, 007 or 012 undoes part of 019** until 019 is run again, as `supabase/README.md`
  says.
- **A server action request with no Origin, or with a matching forwarded host,** still runs. A
  browser always sends an Origin and can't set that header, and the cookie is SameSite Lax, but
  check it on the real host.
- **Open findings.** See the table of what stays open in the [assessment
  summary](../security/assessment-summary.md).
