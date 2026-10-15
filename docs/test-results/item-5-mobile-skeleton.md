# Item 5 test results: mobile skeleton

Two rounds so far. Round 1 was on 4 Oct 2026 in a browser. Round 2 was on 16 Oct 2026 on the iOS
simulator, after we found and fixed a bug where tab pages jumped up under the status bar on iOS.

## Round 2: 16 Oct 2026, iOS simulator

Run on Umer's Mac on `main`, in Expo Go 57.0.9 on an iPhone 17 Pro simulator (iOS 26.5).

### What changed since round 1

- **Tab pages jumping on iOS.** Expo Router keeps every tab loaded in the background. When the
  keyboard closed, for example after pressing Save on New Record, React Native scrolled every loaded
  tab and pushed their tops up under the status bar. Tab screens on iOS now sit inside a safe area
  view, so the page starts below the status bar, and only the screens with text boxes (New Record and
  Scan) react to the keyboard. The change is in `src/components/screen.tsx`.
- **Synced counts.** Home, My Records and Profile used to work out "synced" as total minus pending.
  They now count the records that are marked as synced, so a record that fails to upload in item 10
  won't show up as synced.
- **Expo packages.** Updated with `npx expo install --fix` (Expo 57.0.30, Expo Router 57.0.28 and a
  few others). `npx expo install --check` now says everything matches SDK 57.
- **Expo Doctor in CI.** GitHub now runs it on every pull request and push to `main`. Expo Doctor has
  changed since round 1 and now reads our Liquid Glass icon folder (`assets/expo.icon`) as a broken
  PNG, even though Expo's config schema allows it and `app.json` hasn't changed since 3 Oct. The CI
  step lets that one message through and fails on anything else. The mobile README explains it.

### Automated checks

Run from `mobile/`.

| Check | Command | Result |
| --- | --- | --- |
| Unit tests | `npm test` | Pass, 59 tests in 4 files |
| Typecheck | `npm run typecheck` | Pass |
| Lint | `npm run lint` | Pass |
| Expo Doctor | `npx expo-doctor` | 20 of 21 pass. The one that fails is the known `ios.icon` false alarm |
| Package versions | `npx expo install --check` | Pass, up to date |

The website wasn't changed in this round.

### Tests on the iOS simulator

The app starts with the six mock records. The simulator panel types like a hardware keyboard, so
the on-screen keyboard never opened. That means we couldn't repeat the exact thing that caused the
bug (the keyboard closing), so we checked the result instead: every tab still starts below the
status bar after typing, saving and switching tabs.

| # | Screen | What we did | What should happen | Result |
| --- | --- | --- | --- | --- |
| 1 | Home | Opened the app | The title starts below the status bar. Today's count is 3 with "2 waiting to sync · 1 synced" | Pass |
| 2 | New Record | Typed "Shorea macrophylla" as the species and scrolled to the bottom | Content is cut off at the bottom edge of the status bar instead of sliding under it, and the end of the page scrolls behind the tab bar | Pass |
| 3 | New Record | Pressed Save record | Opens the new record: Shorea macrophylla, Pending sync, height "Not measured", Healthy, 0 photos, "No location saved with this record." and its own tag code | Pass |
| 4 | Home | Went back and opened Home | "4 records waiting to sync", today's count is 4 with "3 waiting to sync · 1 synced", and the new record is at the top | Pass |
| 5 | Scan | Opened the tab | The title starts below the status bar | Pass |
| 6 | Profile | Opened the tab | Records on this phone 7, waiting to sync 4, synced 3 | Pass |
| 7 | New Record | Opened the tab again | The form is empty and back at the top, with the title below the status bar | Pass |
| 8 | My Records | Opened the tab | 7 records, Pending 4, Synced 3, and the tab badge shows 4 | Pass |
| 9 | All tabs | Switched between all five tabs | No page jumps, and none of them leave a gap under the status bar | Pass |
| 10 | My Records | Turned on dark mode | Dark colours, and all the text is easy to read | Pass |

### Not tested yet

| What | Why | Next step |
| --- | --- | --- |
| The keyboard on a real iPhone | The simulator panel can't open the on-screen keyboard | In Expo Go on an iPhone, type a species on New Record and press Save, then check every tab starts below the status bar. Do the same after typing a tag code on Scan |
| Android | There's no Android emulator on this Mac | Run round 1 tests 1 to 14 in Expo Go on an Android phone, and check the keyboard doesn't hide the New Record fields |
| Offline | Needs a real phone | Load the app, turn on airplane mode, then repeat round 1 tests 6 to 13. Nothing in the skeleton uses the internet (records live in memory and GPS is faked), so we expect it to pass |

### Security check

`npm audit` on 16 Oct 2026.

**Website:** the same as round 1. Nothing in the packages the site runs on, and 5 high ones in dev
tools, all the same `braces` advisory through ESLint.

**Mobile:** 65 in total (16 moderate, 49 high), or 42 if you leave out dev tools. npm counts one
advisory again for every package that depends on it, so it's really five, the four from round 1
plus a new one for `sprintf-js`:

| Package | Severity | The problem | Where it comes from | Inside the app on the phone? | Fixed version |
| --- | --- | --- | --- | --- | --- |
| `braces` 3.0.3 | High | Very deeply nested patterns can crash it | Metro, Expo CLI and Jest, to match file names | No, it runs on the laptop | None yet |
| `node-forge` 1.4.0 | High | Its RSA signature check accepts some badly formed signatures | Expo CLI, for dev server certificates | No, it runs on the laptop | None yet |
| `uuid` 7.0.3 | Moderate | No bounds check when you pass in your own buffer | The `xcode` package Expo uses to edit iOS project files | No, build time only | 11.1.1, but `xcode` still asks for 7 |
| `decode-uri-component` 0.2.2 | Moderate | A badly encoded link can make it very slow | Expo Router, through `query-string`, to read links | Yes | 0.5.0, but `query-string` 7 can't use it |
| `sprintf-js` 1.0.3 | Moderate | A huge precision number in a format string can hang it | Jest's code coverage tools, through an old `js-yaml` | No, tests only | None yet |

Don't run `npm audit fix --force`. It would drop Expo down to an old SDK and break the app. Check
again in Sprint #2 and after each Expo update (`npx expo install --fix`).

## Round 1: 4 Oct 2026, browser

Run on Umer's Mac (macOS, Node 22.22.3), on the `item-5-review-fixes` branch.

### Automated checks

Run from `mobile/` unless it says otherwise. At the time GitHub ran all of these except Expo Doctor
on every pull request and every push to `main`. Round 2 added Expo Doctor.

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

After the merge, the first GitHub Actions run on `main` (CI #1, commit `8862abd`) passed both jobs,
Mobile app and Web platform.

### Manual tests in the browser

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

### Security check

`npm audit` on 4 Oct 2026 found the same four advisories as round 2 apart from `sprintf-js`. Mobile
had 61 in total (11 moderate, 50 high), or 38 if you only count what the app depends on. The website
had 5 high ones in dev tools, all `braces`.
