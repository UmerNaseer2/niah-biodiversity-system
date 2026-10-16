# Item 6 test results: QR code scanner

One round so far, on 16 Oct 2026 on the iOS simulator and in a browser. Until now the Scan tab had
a dark box saying "Camera preview goes here" and a Simulate a scan button that opened a random
record. This item swaps that for the real camera with `expo-camera`, so pointing the phone at a
plant's QR tag opens its record. Typing the tag code is still there for tags that won't scan.

## Round 1: 16 Oct 2026, iOS simulator and browser

Run on Umer's Mac on `main`, in Expo Go 57.0.9 on an iPhone 17 Pro simulator (iOS 26.5), and in a
browser on the same Mac.

### What we built

- **The camera.** The Scan tab uses `expo-camera` (`~57.0.6`, the version `npx expo install` picks
  for SDK 57). It only looks for QR codes, since plant tags don't have any other kind of code on
  them.
- **Two tag formats.** A tag's QR code can hold the tag code on its own (`NNP-3F2A9C`) or a link to
  the plant's page on the website (`https://<website>/tag/NNP-3F2A9C`), which a visitor's phone
  camera can open too. The app reads both. Case and spaces don't matter and the hyphen is optional.
  A link can leave out the NNP part, because the website's tag page works without it. A code on its
  own needs it, so a random QR code with 6 letters or digits in it isn't taken for a tag. Item 12
  prints the tags and picks one of the two formats.
- **Links are never opened.** The app only takes the tag code out of a link and looks it up on the
  phone. It doesn't check which website the link is for, because the website doesn't have its
  final address yet, and nothing gets opened anyway. A QR code longer than 500 characters isn't
  read at all.
- **When a scan doesn't work.** A QR code that isn't a plant tag shows "That QR code isn't a Niah
  plant tag." under the camera. A tag with no record on the phone shows "No record with tag
  NNP-XXXXXX on this phone." (with the real code). VoiceOver and TalkBack read the message out, and
  on the web the box has `role="alert"`. A good scan or leaving the tab clears it.
- **One scan, one record.** The camera reports a QR code many times a second, so a code only counts
  again after it has been out of view for 1.5 seconds. Once a record opens, every other code is
  ignored until you come back to the Scan tab, so two tags in view can't open two records.
  - When you come back, the tag you just scanned is probably still in front of the camera, so it
    has to leave the view before it opens again. A different tag opens straight away.
  - Those 1.5 seconds start when the camera is ready, because the camera can take a second or two
    to start on a slow phone.
- **Camera access.** Each case gets its own message and a way out:
  - Not asked yet: "The app needs the camera to read the QR tag on each plant." with an Allow
    camera button.
  - Turned off, and the phone won't ask again: "Camera access is off for this app. Turn it on in
    Settings, then come back here." with an Open Settings button.
  - Blocked in a browser: "Camera access is blocked for this site. Allow it in the browser's site
    settings, then reload the page." A browser has no settings page to open, so there's no button.
  - The app checks camera access again when it comes back to the front, so turning it on in
    Settings works without restarting the app.
- **The camera won't start.** The box says "The camera couldn't start. Try again, or type the tag
  code below." with a Try again button, and screen readers read it out.
- **Torch.** A Turn torch on button for dark spots under the canopy. It turns off when you leave
  the tab. The web doesn't get the button, since a browser can't turn the torch on.
- **Battery.** The camera only runs while the Scan tab is in front. It stops when you switch tabs
  or open a record, and starts again when you come back.
- **Typing the code.** The Type the tag code card is still under the camera, for tags that are
  dirty, wet or won't scan. It takes the code in any case, with or without NNP.
- **Permission text.** `app.json` sets what iOS says when it asks for the camera: "The app uses the
  camera to read the QR tag on each plant." The camera library also has code for recording video
  with sound, so we kept a microphone line too, in case Apple's upload check asks for one. It says
  "The app never records sound. This is only here because the camera library can record video."
  The app never asks for the microphone, and Android leaves that permission out
  (`recordAudioAndroid: false`). Expo Go shows its own text, so ours only shows in a development or
  store build.

How the code is split:

- `src/lib/qr.ts` has the rules: reading the tag code out of a QR code, and working out if a
  sighting is a new scan. Jest can test them without a phone.
- `src/components/qr-scanner.tsx` is the camera box: camera access, the camera itself, the torch
  and the problem message.
- `src/app/(tabs)/scan.tsx` is the Scan tab. It decides what each scan does and keeps the Type the
  tag code card.

### Automated checks

Run from `mobile/`.

| Check | Command | Result |
| --- | --- | --- |
| Unit and screen tests | `npm test` | Pass, 216 tests in 12 files (item 8 had 157 in 10) |
| Typecheck | `npm run typecheck` | Pass |
| Lint | `npm run lint` | Pass |
| Expo Doctor | `npx expo-doctor` | 20 of 21 pass. The one that fails is the known `ios.icon` false alarm from item 5 |
| Package versions | `npx expo install --check` | Pass, up to date |

New tests:

- `src/lib/__tests__/qr.test.ts` (39 tests) checks the rules on their own: the code in different
  cases and spacing, 10 kinds of website link, 16 things it should turn down (a link to some other
  page, a Wi-Fi QR code, an IoT sensor code, a code inside other text, a broken % sequence, `ftp`
  and `javascript` links and more), the 500 character limit, reading back the codes made for 50
  new records, and the 1.5 second rule for a code staying in view.
- `src/__tests__/scan-screen.test.tsx` (20 tests) renders the Scan tab with a mocked
  `expo-camera` and goes through it like a person would: every camera access case, Open Settings,
  checking access again when the app comes back, QR codes only, the torch, the camera and torch
  turning off while a record is open, the camera failing then Try again, opening a record from a
  code and from a link, both problem messages (read out once while the code stays in view), two
  tags at once, not opening the same record again after coming back while its tag is still in
  view, and typing the code.

To check the screen tests catch real bugs, we broke the code on purpose five times: no lock while
a record is open, no holding back the last tag after coming back, the camera left on while a
record is open, the held tag's time not starting again when the camera is ready, and not checking
whether the phone can still ask for camera access. The tests failed every time, then we put the
code back.

The website wasn't changed in this item.

### Tests on the iOS simulator

The simulator has no camera, so the camera box stays black and nothing can be scanned on it. That
needs a real phone (see Not tested yet). Camera access for Expo Go was changed in the Settings app
on the simulator (Privacy & Security > Camera), because `xcrun simctl privacy` has no camera
option.

| # | Screen | What we did | What should happen | Result |
| --- | --- | --- | --- | --- |
| 1 | Scan | Opened the tab for the first time | A dark box saying "The app needs the camera to read the QR tag on each plant." with an Allow camera button, and the Type the tag code card under it | Pass |
| 2 | Scan | Pressed Allow camera | The iOS camera prompt (with Expo Go's own text, see Permission text above) | Pass |
| 3 | Scan | Pressed Allow | The camera box with its four corners and a Turn torch on button, with no error. The box is black because the simulator has no camera | Pass |
| 4 | Scan | Pressed Turn torch on | The button changes to Turn torch off and nothing crashes, even with no torch | Pass |
| 5 | Scan | Went to Home, then back to Scan | The button is back to Turn torch on, so the torch went off | Pass |
| 6 | Scan | Typed 3f2a9c (no NNP) in the Tag code box and pressed return | Opens the Belian record, NNP-3F2A9C | Pass |
| 7 | Record page | Went back | The Scan tab with an empty Tag code box and the camera box back | Pass |
| 8 | Scan | Typed NNP-ABCDEF and pressed return | "No record with that tag on this phone." in red, with a red border round the box | Pass |
| 9 | Scan | Swiped up | Find record can be reached above the floating tab bar | Pass |
| 10 | Scan | Turned camera access off for Expo Go in Settings, then opened the project again | "Camera access is off for this app. Turn it on in Settings, then come back here." with an Open Settings button and no torch button. Typing a tag code still works under it | Pass |
| 11 | Scan | Pressed Open Settings | The iOS Settings app opens, with "◀ Expo Go" at the top to go back | Pass |
| 12 | Scan | Turned camera access back on, went back to Expo Go and opened the Scan tab | The camera box with its four corners and Turn torch on | Pass |

Both times camera access changed in Settings (rows 10 and 12), iOS closed Expo Go, so we opened
the project again with `xcrun simctl openurl <device> exp://127.0.0.1:8081`. Because of that, the
check that runs when the app comes back to the front never got used on iOS, since the app always
started fresh. It's there for Android, which doesn't restart an app when a permission is turned
on. The screen tests cover it, and it's in Not tested yet below.

Metro showed no errors or warnings during the round.

### Tests in a browser

The browser on Umer's Mac blocks the camera for every site, so this checks the blocked message on
the web. It was the page Metro serves at `http://localhost:8081`, which is what `w` opens after
`npx expo start`.

| # | What we did | What should happen | Result |
| --- | --- | --- | --- |
| 1 | Opened the Scan tab | "Camera access is blocked for this site. Allow it in the browser's site settings, then reload the page." with no Open Settings or torch button | Pass |
| 2 | Typed NNP-ABCDEF and pressed Enter | "No record with that tag on this phone." | Pass |
| 3 | Typed 3f2a9c and pressed Enter | Opens the Belian record, NNP-3F2A9C | Pass |
| 4 | Checked the browser console | No errors | Pass |

### Not tested yet

| What | Why | Next step |
| --- | --- | --- |
| Scanning real tags against the proposal's target (95% of scans within 3 seconds) | The simulator has no camera | Print QR codes for two of the mock tags, NNP-3F2A9C as a code on its own and NNP-8C41E7 as a website link. Scan each one 20 times on each phone from about 20 to 30 cm away, timing from pointing the camera to the record opening. The target is 19 of 20 within 3 seconds |
| Low light and the torch | Needs a real phone | Scan in a dark room with and without the torch, and check the torch goes off when you leave the tab |
| Dirty, wet, scratched or curved tags | Needs printed tags | Scan tags that are crumpled, wet or wrapped round a branch, and check typing the code works when they won't scan |
| Two tags in view at once | Needs printed tags | Hold two tags in front of the camera and check only one record opens |
| Coming back with the tag still in view | Needs a real camera | Scan a tag, go back from the record while still pointing at it, and check it only opens again after you move away and come back |
| Android | No Android emulator on this Mac | Run rows 1 to 12 on an Android phone. Also turn camera access on in Settings while the app is still open, and check the camera comes back without a restart |
| A browser that allows the camera | The browser we used blocks it | Allow the camera for the site and check a tag scans on the web too |
| Our own permission text | Expo Go shows its own | Check it in the first development build |
| VoiceOver and TalkBack | The simulator panel can't play a screen reader we can hear | With a screen reader on, scan a QR code that isn't a plant tag and check it reads out "That QR code isn't a Niah plant tag." |

### Security check

`npm audit` on 16 Oct 2026, after adding `expo-camera`.

**Website:** not changed in this item.

**Mobile:** 65 in total (16 moderate, 49 high), the same as item 8, and none of them come through
`expo-camera`. It's still the same five advisories as
[item 5 round 2](item-5-mobile-skeleton.md#security-check): `braces`, `node-forge`, `uuid`,
`decode-uri-component` and `sprintf-js`. With `npm audit --omit=dev` it's 61 (16 moderate,
45 high), also the same as item 8.

**What a QR code can hold.** Anyone can print a QR code and stick it on a tree, so the app treats
what it reads as untrusted. It only takes a tag code out of it and looks that up in the records on
the phone. It never opens a link from a QR code, even one that looks like ours, and it ignores
anything over 500 characters without reading it.

Don't run `npm audit fix --force`. It would drop Expo down to an old SDK and break the app.
