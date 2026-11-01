# Security assessment summary (items 25 to 27)

A short record of the security round on 31 Oct 2026, for the Sprint #2 report. The method is in the
[assessment plan](vulnerability-assessment-plan.md), and the commands and real results are in the
[test results](../test-results/item-25-27-security.md). The repo is public, so this page has no
steps to repeat. Those stay in the private findings log.

**These fixes aren't on the hosted project.** The SQL only reaches it once Umer runs 003 to 021 in
order, and the website fixes only reach people once the branch is merged and deployed.

## What was tested

Everything ran on Umer's Mac, against a local production build of the website and the Supabase
stand-in, which runs our real SQL. Nothing hosted was touched, and there were no denial of service
tests. All the data was made up.

| Check from the plan | What ran |
| --- | --- |
| 1 Roles | Every role against every table, view, function and bucket through the API, the IoT ones too, and every server action called directly with the wrong role |
| 2 Approval before public | Every public page, API answer, CSV and map payload searched for exact points, notes and waiting records |
| 3 Secrets | `git grep` and `git log -S` over the tree and history, `git check-ignore`, the website's built files and the phone's bundle |
| 4 Encryption | Header check on the production build, cookie flags in a real browser. HTTPS on a real host couldn't run |
| 5 Input and uploads | Bad input and bad files sent straight to the server actions and the buckets, and redirects on the sign in pages |
| 6 Sync | The sync SQL tests and direct uploads through the API as each role |
| 7 IoT | Device tokens and role checks through the API, other devices' nodes in the SQL tests, and the firmware's certificate check by reading it |

Tools: `npm audit`, the SQL tests, ESLint and TypeScript, the secret search, the header check, our
own scripts against the production build, and the OWASP Top 10, ASVS and MASVS checklists (MASVS by
reading the code only).

**OWASP ZAP didn't run.** Docker Desktop wouldn't start on the Mac and the Mac has no Java, so
neither way of running it worked. Our own signed out script looked at the same kinds of things, but
it isn't ZAP and doesn't replace its scan. Security Advisor and SSL Labs need the hosted project or
a deployed site, so they didn't run either.

## What was found

| Level | Found | Fixed on the branch | Open |
| --- | --- | --- | --- |
| Critical | 0 | 0 | 0 |
| High | 2 | 2 | 0 |
| Medium | 7 | 5 | 2 |
| Low | 14 | 5 | 9 |

The levels are the ones in the plan. Each finding is something that was in our code before this
round.

## What was fixed

In general terms:

- The public gets less about a plant whose spot is hidden, and a plant whose name disagrees with its
  species link now counts as hidden, so it fails closed (SQL 019).
- Someone who loses their field staff role also loses their own record photos, and helper functions
  are closed to people who aren't signed in (SQL 020).
- Every role change is written down, and the last administrator can't be removed (SQL 021).
- Login cookies last 12 hours and page scripts can't read them.
- The plain report file gives less about hidden plants.
- A removed photo's file really goes before the officer is told so.
- Every page sends two more cross origin headers.
- An outage says so instead of saying "No access", clearing About on a species clears the public
  text, and a failed request no longer wipes a form.

## What stays open, and why

| Level | What | Why it's open |
| --- | --- | --- |
| Medium | A package in the phone app's shipped code (through Expo Router) has a known advisory. No data is at risk, and the worst case is the app stops responding until it's closed | The phone is being worked on separately. The fix is with the phone work, and needs a package override or a major Expo Router update |
| Medium | The phone's records file has no encryption of its own | SQLCipher is on the item 22 branch, not merged yet |
| Low | No account deletion on the users page | Deactivating removes access at once. Deleting loses the trail, so this is a decision for the team |
| Low | No upper limit on a record's date or photo count | A limit could strand a phone with a wrong clock |
| Low | Record IDs chosen by the phone can show that an ID exists | The phone needs that answer for syncing, and IDs are random |
| Low | Species photo links can point at other https sites | Only officers and admins can set them |
| Low | No rate limit on IoT readings, and readings are never cleaned out | No simple fix in SQL. Recorded as a limit |
| Low | Moderate advisories in the website's dev tools | 0 in what ships |
| Low | The security policy still allows inline scripts | A nonce would make every page dynamic |
| Low | The map tile host can see which area is being viewed | Public pages only ever have the rough point |
| Low | A malformed URL on some pages gives a plain server error | It gives nothing away |

## Still to do

- Umer runs 003 to 021 on the hosted project, then Security Advisor.
- Run ZAP against a local production build once Docker works, or on a teammate's laptop.
- Try HTTPS and SSL Labs once the site is deployed.
- Try two administrators changing roles at the same moment on a real Postgres. The SQL tests run on
  one connection, so they can't do it at the same time.
- Do this round again on staging, before production (items 42 to 44).
