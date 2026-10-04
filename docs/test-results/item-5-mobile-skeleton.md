# Item 5 test results: mobile skeleton

Run on 4 Oct 2026 on Umer's Mac (macOS, Node 22.22.3), on the `item-5-review-fixes` branch.

## Automated checks

Run from `mobile/` unless it says otherwise. GitHub now runs the same checks on every pull request.

| Check | Command | Result |
| --- | --- | --- |
| Unit tests | `npm test` | Pass, 59 tests in 4 files |
| Typecheck | `npm run typecheck` | Pass |
| Lint | `npm run lint` | Pass |
| Expo Doctor | `npx expo-doctor` | Pass, 21 of 21 checks |
| Website lint | `npm run lint` in `web/` | Pass |
| Website build | `npm run build` in `web/` | Pass |

The unit tests cover the date and number formatting, the height check on the New Record form,
record IDs, looking up a plant by its tag code, and the mock data (no repeated IDs or tags, and the
fake GPS points stay near the park HQ).

## Manual tests in the browser

The app ran on the Expo dev server and was opened in a browser window 534 x 321 px, plus 320 px and
375 px wide for the photo slots. It starts with the six mock records.

| # | Screen | What we did | What should happen | Result |
| --- | --- | --- | --- | --- |
| 1 | Home | Opened the app | "3 records waiting to sync", today's count is 3 with "2 waiting to sync · 1 synced", and the recent records show their sync tags | Pass |
| 2 | Tab bar | Checked the My Records tab | Badge shows 3, and a screen reader hears "My Records, 3 records waiting to sync" | Pass |
| 3 | Scan | Typed `3f2a9` and pressed Enter | "No record with that tag on this phone." and it stays on Scan | Pass |
| 4 | Scan | Typed another letter after that | The error goes away | Pass |
| 5 | Scan | Typed `nnp-3f2a9c` and pressed Enter | Opens the Belian record, tag NNP-3F2A9C, 18.5 m, Pending sync | Pass |
| 6 | New Record | Opened it with nothing filled in | Hint says "Add the species name to save." | Pass |
| 7 | New Record | Species "Testus plantus", height `1e2`, then left the box | Error "Enter a height in metres between 0 and 120, like 12.5", hint "Fix the height to save." and Save is disabled | Pass |
| 8 | New Record | Changed the height to `12,5` | Error goes, Save is enabled, hint asks to capture a location first | Pass |
| 9 | New Record | Pressed Capture location | Button says "Getting location…" and the hint says "Waiting for the location…", then a made up point near the park HQ shows with its accuracy and the button changes to "Retake location" | Pass |
| 10 | New Record | Pressed Save record | Opens the new record: Testus plantus, Pending sync, 12.5 m, Healthy, 0 photos, with its own tag code | Pass |
| 11 | New Record | Went back | The form is empty again | Pass |
| 12 | My Records | Opened the tab | 7 records with the new one at the top, Pending 4, and the tab badge shows 4 | Pass |
| 13 | Home | Opened the tab | "4 records waiting to sync" and today's count is 4 | Pass |
| 14 | Record page | Opened `/record/does-not-exist` | "Record not found", and "Go to my records" opens My Records | Pass |
| 15 | New Record | Window 320 px wide | The third photo slot wraps onto a second row and nothing sticks out sideways | Pass |
| 16 | New Record | Window 375 px wide | All three photo slots fit on one row | Pass |
| 17 | All | Watched the browser console during the run | No errors | Pass |

## Not tested yet

| What | Why | Next step |
| --- | --- | --- |
| iOS | The iOS simulator on this Mac needs a permission that hasn't been given yet | Run tests 1 to 14 in Expo Go on an iPhone |
| Android | There's no Android emulator on this Mac | Run tests 1 to 14 in Expo Go on an Android phone, and check the keyboard doesn't hide the New Record fields |
| Offline | Needs a real phone | Load the app, turn on airplane mode, then repeat tests 6 to 13. Nothing in the skeleton uses the internet (records live in memory and GPS is faked), so we expect it to pass |

## Security check

`npm audit` on 4 Oct 2026.

**Website:** nothing in the packages the site runs on. There are 5 high ones in dev tools, all the
same `braces` advisory through ESLint.

**Mobile:** 61 in total (11 moderate, 50 high), or 38 if you only count what the app depends on.
npm counts one advisory again for every package that depends on it, so it's really four:

| Package | Severity | The problem | Where it comes from | Inside the app on the phone? | Fixed version |
| --- | --- | --- | --- | --- | --- |
| `braces` 3.0.3 | High | Very deeply nested patterns can crash it | Metro, Expo CLI and Jest, to match file names | No, it runs on the laptop | None yet |
| `node-forge` 1.4.0 | High | Its RSA signature check accepts some badly formed signatures | Expo CLI, for dev server certificates | No, it runs on the laptop | None yet |
| `uuid` 7.0.3 | Moderate | No bounds check when you pass in your own buffer | The `xcode` package Expo uses to edit iOS project files | No, build time only | 11.1.1, but `xcode` still asks for 7 |
| `decode-uri-component` 0.2.2 | Moderate | A badly encoded link can make it very slow | Expo Router, through `query-string`, to read links | Yes | 0.5.0, but `query-string` 7 can't use it |

Don't run `npm audit fix --force`. It would drop Expo down to SDK 44 and break the app. Check again
in Sprint #2 and after each Expo update (`npx expo install --fix`).
