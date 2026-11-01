# Test plan

How we test the Niah system: what counts as good enough, which kinds of test we run, what they run
on, and where each one has got to. It's deliverable D8 in the proposal. Results for each item are in
[`test-results/`](test-results/). This page doesn't repeat them, it says where to find them.

Written on 1 Nov 2026, at the end of Sprint #2. The numbers below are from `main` on that day.

## What counts as done

A schedule item is done when it meets our Definition of Done (`CONTRIBUTING.md`):

- It matches the Scope and the Initial Release Schedule.
- It passed its test cases and the results are in `docs/test-results/`.
- Mobile features were tested offline and on both Android and iOS.
- Another team member reviewed the code.
- No known critical or high severity problems remain in it.
- It's documented, and it was shown and signed off at a Quality Review.

Ticking an item in `docs/sprint-2.md` means the code is merged and tested as far as we could. It
doesn't mean all of the above. Android, real phones, teammates' reviews and the sign off are still
open for most Sprint #2 items, and each results page says what wasn't tested.

## Quality targets and where they stand

The targets are the ones in the proposal's Quality Management section.

| Attribute | Target | Where it stands | Evidence |
| --- | --- | --- | --- |
| Usability | 90% of tasks completed, SUS score of 70 or above | Not run. Planned for Week 10 with real users, see [below](#usability-test-for-week-10) | None yet |
| Performance | Saving on the phone under 1 s, submitting under 3 s on 4G, web search under 2 s | Web search took 0.59 s on a dev server, measured once. The other two haven't been timed on a real phone. Load testing is item 37 | [Item 16](test-results/item-16-plant-search.md) |
| Security | All critical and high findings fixed and retested by Week 9 | No criticals. Both highs fixed in our code and retested locally. The hosted project doesn't have the fixes until 003 to 021 are run, and OWASP ZAP hasn't been run | [Items 25 to 27](test-results/item-25-27-security.md) |
| Privacy of locations | 0 public pages or responses show an exact point of an endangered plant | 0 on a local production build, signed out and as each role. Not checked on the hosted project | [Items 25 to 27](test-results/item-25-27-security.md) |
| Functional correctness | 95% of required fields captured and shown correctly | Each field has test cases that pass, but we haven't worked out one percentage across both platforms. The mapping is [below](#scope-to-test-results) | Below |
| GPS accuracy | Every synced record has a point and an accuracy, 90% within 10 m of a reference point | The first part is in the form and the upload. The reference point walk needs real phones outdoors and hasn't been done | [Item 8](test-results/item-8-gps.md) |
| QR reliability | 95% of printed tags scan within 3 s, in sun and shade, and open with no signal | Opening a saved record with no signal works on the simulator. Printed tags outdoors with two phones haven't been tried | [Item 6](test-results/item-6-qr-scanner.md), [Item 12](test-results/item-12-qr.md) |
| Reliability of sync | 0% data loss, up within 5 minutes of signal coming back, no duplicates | Nothing lost and no duplicates on the simulator. 80 and 85 s, each measured once. A connection cut part way through is only covered by the unit tests | [Item 10](test-results/item-10-sync.md) |
| Compatibility | Android 10 and iOS 15 or newer, current Chrome, Edge, Safari and Firefox | Only the iOS simulator and one Chromium based browser so far. Expo SDK 57 needs iOS 16.4 or newer, so the proposal's iOS 15 can't be met, and we should change that target. This is item 43 as well | [Item 22](test-results/item-22-encryption.md) and other item results |
| IoT monitoring | Alerts within 30 s, under 5% of readings missing over 24 hours | About 25 s by adding up the steps, not measured end to end. Nothing flashed to real hardware, and the 24 hour run hasn't happened | [Items 29](test-results/item-29-sensor-pipeline.md) to [31](test-results/item-31-threat-alerts.md) |
| Maintainability | All backend APIs documented, a README for each module | `mobile/`, `web/`, `supabase/` and `iot/` each have a README. API docs are item 35 | READMEs |

## Kinds of test

| Kind | What it covers | How to run it | Count on 1 Nov |
| --- | --- | --- | --- |
| Phone unit and screen tests | Forms, rules, SQLite, the sync engine, photos, QR, encryption. Jest with sql.js in place of SQLite | `cd mobile && npm test` | 33 suites, 744 tests |
| Database tests | The real SQL files on PGlite, signing in as each role, and the stand-in itself | `cd supabase/tests && npm test` | 76 suites, 411 tests |
| Website checks | Types, lint and a production build. The website has no unit tests, so its behaviour is covered by the database tests and by hand | `cd web && npm run lint && npm run build` | No count |
| By hand, end to end | The phone on the iOS simulator and the website in a browser, both against the stand-in with made up data | The steps are in each results page | About 40 results pages |
| Security | Access checks as each role, headers, cookies, photo metadata, packages. Scope and tools are in the [assessment plan](security/vulnerability-assessment-plan.md) | The commands in the [results](test-results/item-25-27-security.md) | Findings are kept private until hosted is fixed |
| IoT | Compiling both sketches, and a simulator that sends like an edge device, with 11 scenarios | `arduino-cli compile` and `iot/node-simulator/`, see [item 28](test-results/item-28-iot-framework.md) and [item 29](test-results/item-29-sensor-pipeline.md) | Compile only for the hardware |
| CI | Lint, types, unit tests, Expo Doctor, website build and SQL tests on every push and pull request | GitHub Actions | 3 jobs |

A test that passes has to be able to fail, so for the SQL we changed a policy on purpose and checked
the tests caught it. A bug we find by hand gets a test along with its fix.

## Environment

| What | Used for | Details |
| --- | --- | --- |
| Umer's Mac | All local testing | macOS, Node 22, Xcode 26.5 |
| iOS simulator | Phone by hand | iPhone 17 Pro on iOS 26.5, Expo Go for SDK 57, plus a development build for SQLCipher |
| Stand-in | Local Supabase in its place | `supabase/tests/stand-in.js`, the same SQL on PGlite, in memory. Test accounts use `@example.test` |
| GitHub Actions | CI | `ubuntu-latest`, Node 22 |

Still needed:

- Two Android phones (Android 10 or newer) and one iPhone, each with a passcode
- Chrome, Edge, Safari and Firefox, on desktop and on a phone screen
- The hosted Supabase project with 003 to 021 run, and the website redeployed from `main`, since the
  live site is older than that
- An ESP32 node and edge device with their sensors, for the flash, the alert timing and the 24 hour
  run
- A printer and laminate for the QR tags
- OWASP ZAP, which needs either Docker or Java on the machine running it

Everything uses made up data. Real locations of protected plants never go in a test.

## Scope to test results

The Basic Functionalities in the Scope, and where each one is tested.

| Scope | Function | Results |
| --- | --- | --- |
| Field app | Register new plant records on site | [Item 7](test-results/item-7-record-form.md) |
| Field app | Taxonomy, height and other details | [Item 7](test-results/item-7-record-form.md) |
| Field app | Capture and attach photographs | [Item 11](test-results/item-11-photos.md) |
| Field app | Record the GPS location | [Item 8](test-results/item-8-gps.md) |
| Field app | Sync with the central database | [Item 10](test-results/item-10-sync.md) |
| Field app | Generate a QR code for each record | [Item 12](test-results/item-12-qr.md) |
| Field app | Scan QR tags, and collect data offline | [Item 6](test-results/item-6-qr-scanner.md), [Item 9](test-results/item-9-offline-storage.md) |
| Website | Add, edit and delete species | [Item 14](test-results/item-14-plant-schema.md), [Item 17](test-results/item-17-plant-edit-delete.md) |
| Website | Upload photographs and supporting information | [Item 18](test-results/item-18-photo-gallery.md) |
| Website | Review and approve observations | [Item 19](test-results/item-19-observation-approval.md) |
| Website | Search and filter | [Item 16](test-results/item-16-plant-search.md) |
| Website | Distribution maps | [Item 20](test-results/item-20-maps.md) |
| Website | Generate and export reports | [Item 21](test-results/item-21-reports.md) |
| Security | Secure login | [Item 2](test-results/item-2-auth.md), [Item 15](test-results/item-15-officer-auth.md) |
| Security | Access control | [Item 4](test-results/item-4-access-control.md), [Item 2 website](test-results/item-2-admin-users.md) |
| Security | Encryption | [At rest](security/encryption-at-rest.md), [item 22](test-results/item-22-encryption.md), [in transit](security/encryption-in-transit.md) |
| Security | Assessment, fixes and reassessment | [Items 25 to 27](test-results/item-25-27-security.md) |
| IoT | Real time sensing and data storage | [Item 28](test-results/item-28-iot-framework.md), [Item 29](test-results/item-29-sensor-pipeline.md) |
| IoT | Threat detection and alerts | [Item 31](test-results/item-31-threat-alerts.md) |
| IoT | Monitoring dashboard | [Item 30](test-results/item-30-monitoring-dashboard.md) |
| IoT | GPS based tracking, ecological analysis | Items 32 and 33, after Sprint #2 |
| Innovation | Limits of current methods, improved workflow | [Item 38](innovation/ground-truthing-limitations.md), [Item 39](innovation/improved-workflow.md). Testing it is items 40 and 41 |

## Usability test for Week 10

The proposal plans this for Week 10, with people like the ones who'd use the system. It's the
rubric's Task Flow and Ease of Use row. Nothing below has been run yet.

**Who:** at least 5 people who didn't build the system. SFC staff if we can get them, otherwise
students from outside the team, and we'd say which in the results. 5 is our choice, because it's
what we can organise in a week and it usually shows the biggest problems.

**How:** one person at a time, on a real phone and a laptop, with made up data. Give them the task
and not the steps. Don't help unless they're stuck for 2 minutes, and if we do, that task counts as
not completed.

**Tasks on the phone (botanist):**

1. Sign in.
2. With no signal, save a new plant record with a species, height, GPS point and a photo.
3. Find that record again in My Records and say whether it's on the server yet.
4. Turn the signal back on and get it uploaded.
5. Scan a QR tag and open its record.
6. Find out why a rejected record was rejected.
7. Show the QR tag for a record and print it.

**Tasks on the website (conservation officer):**

8. Sign in and find the records waiting for review.
9. Approve one record and reject another with a reason.
10. Add a species with a photo, then correct a mistake in it.
11. Find every record of one species and export a report.
12. Find the most urgent sensor alert, say what it means, then resolve it.

**Task on the website (visitor):**

13. Find a plant by its common name and read about it.

**What we write down:** completed or not, time taken, mistakes, what they said while doing it, and
the 10 question System Usability Scale at the end. For SUS, take 1 from each odd answer's score,
take each even answer's score from 5, add them up and multiply by 2.5.

**Pass marks:** at least 90% of tasks completed across everyone, and an average SUS of 70 or above.
The results go in `docs/test-results/usability.md`, with what we changed because of them.
