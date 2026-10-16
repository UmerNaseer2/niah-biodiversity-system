# Item 8 test results: GPS location capture

One round so far, on 16 Oct 2026 on the iOS simulator. Until now the Location card on the New
Record form made up a point near the park HQ. This item swaps that for the phone's real GPS with
`expo-location`, and a record can't be saved without a location any more.

## Round 1: 16 Oct 2026, iOS simulator

Run on Umer's Mac on `main`, in Expo Go 57.0.9 on an iPhone 17 Pro simulator (iOS 26.5).

### What we built

- **Real GPS.** The form uses `expo-location` (`~57.0.21`, the version `npx expo install` picks for
  SDK 57). It watches the position on the most accurate setting, which turns the GPS chip on,
  instead of asking once, so it can wait for a good fix.
- **Waiting for a good fix.** A fix of 10 m or better, the proposal's target, is kept straight
  away. A rougher fix shows on screen while the phone keeps working on it for up to 30 seconds, and
  then the best one is kept. "Use this location" takes the best fix so far without waiting.
  Accuracy is rounded up to whole metres, so a 4.6 m fix is saved as 5 m and never looks better
  than it was.
- **Old fixes are skipped.** A phone can hand back a fix it saved earlier. Anything from more than
  10 seconds before the capture started is ignored, so a record never gets the last plant's
  location.
- **No fix.** If there's still no fix after 3 minutes, it stops and says to move to a clearer spot,
  away from cliffs and thick canopy. GPS doesn't need phone signal, but the first fix is slower
  without it, so the card says that while it looks.
- **Location is required now.** Save stays off until there's a location, and the hint under it says
  "Capture the location to save." The proposal's target is that 100% of synced records have GPS
  coordinates and an accuracy in metres, and this form is where records come from.
- **Permission problems.** Each one gets its own message and a way out:
  - Permission turned down: "Try again" asks again while the phone still allows it. Once it
    doesn't, an "Open Settings" button shows.
  - Approximate location (iOS with Precise off, or Android's approximate option): it won't save a
    location that can be kilometres off, so it asks to turn precise location on in Settings.
  - Location turned off on the phone: it says to turn it on.
  - Anything else: "Something went wrong getting the location. Please try again."
- **Retake.** Retake location keeps the old location until a new one comes in, and Save waits while
  the retake runs. If the retake fails or gets cancelled, the old one is still there and the card
  says so.
- **No Android pop up.** On Android, expo-location normally asks to turn on Wi-Fi and mobile network
  location before it starts. Saying no there would fail every capture, so the app skips that dialog
  and uses GPS on its own. There's usually no signal in the forest anyway. iOS doesn't have this
  dialog. We checked expo-location's own code too: on both phones, a short "location unknown"
  moment (common under trees) doesn't stop the capture, it just keeps looking.
- **Screen readers.** VoiceOver and TalkBack read out "Location captured, accurate to about
  5 metres." (with the real number) when a capture finishes, and read out any problem. On the web
  the problem box has `role="alert"`.
- **Battery.** The GPS watch stops as soon as the capture is done or cancelled, or the screen goes
  away.
- **Permission text.** `app.json` sets what iOS says when it asks for location: "The app saves your
  location with each plant record, so the plant can be found again." Expo Go shows its own text
  instead, so ours only shows in a development or store build.
- **The fake GPS is gone.** `mockGpsReading()` was taken out of `src/data/mock-records.ts`. The mock
  records keep their made up points near the park HQ.

How the code is split:

- `src/lib/gps.ts` has the rules as a plain reducer (what each fix, timer or button press does), so
  Jest can test them without a phone.
- `src/hooks/use-gps-capture.ts` connects those rules to expo-location: the permission, the watch
  and the two timers.
- `src/components/location-capture.tsx` is the Location card on the form.

### Automated checks

Run from `mobile/`.

| Check | Command | Result |
| --- | --- | --- |
| Unit and screen tests | `npm test` | Pass, 157 tests in 10 files (item 7 had 109 in 8) |
| Typecheck | `npm run typecheck` | Pass |
| Lint | `npm run lint` | Pass |
| Expo Doctor | `npx expo-doctor` | 20 of 21 pass. The one that fails is the known `ios.icon` false alarm from item 5 |
| Package versions | `npx expo install --check` | Pass, up to date |

New tests:

- `src/lib/__tests__/gps.test.ts` (25 tests) checks the rules on their own: rounding the accuracy
  up, turning down broken readings (no accuracy, NaN, infinity), skipping old fixes, picking the
  better of two fixes, stopping at 10 m, keeping the best fix for 30 seconds, giving up with no fix,
  cancel, a retake keeping the old location, and ignoring anything that turns up after a capture is
  over.
- `src/hooks/__tests__/use-gps-capture.test.ts` (20 tests) runs the hook against a mocked
  expo-location: the watch settings, only asking for permission while the phone can still show the
  prompt, approximate location on iOS and Android, location turned off, both timers (with Jest's
  fake timers), errors, and that the watch always stops (after a fix, on cancel, on an error and
  when the screen goes away).
- `src/__tests__/new-record-screen.test.tsx` now captures a location before saving, checks the
  saved record has it, and checks Save stays off until there's a location. Three new screen tests
  cover a rough fix showing while it improves (and "Use this location" saving it), the screen
  reader message, and the Open Settings button when location access is off.
- `src/lib/__tests__/record-form.test.ts` now checks a record needs a location, and that Save waits
  for a retake to finish even when there's a location from before.
- The test for `mockGpsReading()` in `src/data/__tests__/mock-records.test.ts` went with it.

To check the hook tests catch real bugs, we broke the hook on purpose twice: once letting fixes
through after a cancel, and once not stopping a watch that only finished starting after a cancel.
The tests failed both times, then we put the code back.

The website wasn't changed in this item.

### Tests on the iOS simulator

The simulator's location was set to the park HQ (3.8141, 113.7787) with
`xcrun simctl location <device> set 3.8141,113.7787`. That point is public, it's where the park
office is. Location access for Expo Go was changed with `xcrun simctl privacy`.

| # | Screen | What we did | What should happen | Result |
| --- | --- | --- | --- | --- |
| 1 | New Record | Opened the tab | The subtitle says "Fill in what you can. Only the species and location are required." The Location card says "Stand next to the plant, then capture. GPS works without phone signal." with a Capture location button | Pass |
| 2 | New Record | Turned location access off for Expo Go, then pressed Capture location | A warning: "Location access is off for this app. Turn it on in Settings, then try again." with Open Settings and Try again buttons | Pass |
| 3 | New Record | Pressed Open Settings | The iOS Settings app opens, with "◀ Expo Go" at the top to go back | Pass |
| 4 | New Record | Reset the permission so iOS asks again, then pressed Capture location | "Getting ready…" with a Cancel button, then the iOS location prompt (with Expo Go's own text, see Permission text above) | Pass |
| 5 | New Record | Pressed "Allow While Using App" | "3.81410° N, 113.77870° E", a green "±5 m · Good" pill, the time it was captured and a Retake location button | Pass |
| 6 | New Record | Picked *Shorea macrophylla* from the suggestions and scrolled down | Save is on, with "Saved on this phone first. It uploads when you sync." under it | Pass |
| 7 | New Record | Pressed Save record | Opens the new record with its own NNP tag, Pending sync, and the same location and "±5 m · Good" pill | Pass |
| 8 | Record page | Went back | The form is empty with Capture location showing again, so the next plant needs its own location. The My Records badge goes from 3 to 4 | Pass |

We also tried the "no signal" case by clearing the simulated location with
`xcrun simctl location <device> clear`. The simulator still handed back the last point with a new
time, so the capture went straight to "±5 m · Good". So "Looking for GPS satellites…", Cancel and
the 3 minute timeout were only checked in Jest for now (see below).

### Not tested yet

| What | Why | Next step |
| --- | --- | --- |
| Accuracy against a known point (the proposal's 90% of open ground readings within 10 m) | Needs real phones outside | Campus reference point test: pick a spot with known coordinates, capture there 20 times on each phone, and count how many land within 10 m. The target is 18 of 20 |
| Under canopy | Needs real trees | On the first park visit, or under a thick patch of trees on campus, check how long the first fix takes and how often it gets to 10 m |
| The first fix with no phone signal | The simulator always has a location, even after clearing it | Outside, with flight mode on and Wi-Fi off, press Capture location. Check "Looking for GPS satellites…" shows, time the first fix, and check Cancel works |
| "Couldn't get a GPS fix" after 3 minutes | Same reason. Jest checks it with fake timers | Indoors away from windows, with flight mode on, press Capture location and wait 3 minutes |
| Approximate location (iOS Precise off, Android approximate) | Not tried on the simulator, and there's no Android emulator on this Mac | On each phone, give Expo Go approximate location only and check the message and the Open Settings button |
| Skipping the Android Wi-Fi and network dialog | No Android emulator on this Mac | On an Android phone with "Google Location Accuracy" off, press Capture location and check no dialog pops up and it still gets a fix |
| Our own permission text | Expo Go shows its own | Check it in the first development build |
| VoiceOver and TalkBack | The simulator panel can't play a screen reader we can hear | With a screen reader on, capture a location and check it reads out "Location captured, accurate to about N metres." |
| Web | The phone is the real target | Quick check in a browser that capture works and the problem messages show |

### Security check

`npm audit` on 16 Oct 2026, after adding `expo-location`.

**Website:** not changed in this item.

**Mobile:** 65 in total (16 moderate, 49 high), the same as item 7, and none of them come through
`expo-location`. It's still the same five advisories as
[item 5 round 2](item-5-mobile-skeleton.md#security-check): `braces`, `node-forge`, `uuid`,
`decode-uri-component` and `sprintf-js`.

If you leave out dev tools (`npm audit --omit=dev`) it now says 61 instead of 42. Nothing new got
into the app, it's how npm counts. Adding `expo-location` made npm work out the lock file again,
and 95 Jest packages are now marked `devOptional` instead of `dev`. That's because Expo Router lists
`@testing-library/react-native` as an optional peer, which pulls Jest in, and `--omit=dev` still
counts `devOptional` packages. Jest only runs on our laptops and in CI, it never ships in the app.

Don't run `npm audit fix --force`. It would drop Expo down to an old SDK and break the app.
