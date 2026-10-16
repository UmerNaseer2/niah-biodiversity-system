# Item 7 test results: plant record form

One round so far, on 16 Oct 2026 on the iOS simulator. Item 5 already had the form's layout and a
basic height check. This item finished it: species suggestions, better checks on what people type,
and errors that a screen reader can hear.

## Round 1: 16 Oct 2026, iOS simulator

Run on Umer's Mac on `main`, in Expo Go 57.0.9 on an iPhone 17 Pro simulator (iOS 26.5).

### What we built

- **Species suggestions.** After 2 letters the form suggests up to 4 species from
  `src/data/species-list.ts`. That's the 6 species in `supabase/002_seed_data.sql` plus the 2 extra
  ones on the website's mock list. A suggestion matches the start of any word in the scientific name
  or a common name, so "shor", "macro", "belian" and "durian kun" all find something. Tapping one
  fills in the scientific name, and the common name too if that box is still empty.
- **Linking to the species table.** A name on the list, picked or typed out in full in any case, is
  saved the way the list spells it, along with its slug, like `shorea-macrophylla`. That's the same
  ID the Supabase species table uses, so item 10 can link the record when it uploads.
- **Names that aren't on the list still save.** Something like "Ficus sp." saves without a slug, so
  nobody gets stuck when they find a plant we didn't list. The hint under the box says whether the
  name is on the list.
- **Height.** Still between 0 and 120 m, but now with 2 decimal places at most. The database keeps
  heights as `NUMERIC(5,2)`, so before this "12.345" would have been rounded off without anyone
  knowing. Now it gets an error that says what to fix.
- **Errors you can hear.** Errors still only show after you leave a box, so they don't flash up
  while you type. On a phone, VoiceOver and TalkBack read them out straight away, and on the web
  they have `role="alert"`.
- **Length limits.** Species 120 characters, common name 80 and notes 1000. The notes box counts
  down when there are 100 characters left. Extra spaces in names are squashed before saving.
- **The keyboard on Android.** Android apps draw edge to edge now, so the window doesn't shrink when
  the keyboard opens and the lower boxes could end up hidden behind it. On Android, screens with
  text boxes now pad the page by the keyboard height (`src/components/screen.tsx`). iOS already
  handled this.
- **Form checks in one place.** The rules moved out of the screen into `src/lib/record-form.ts` and
  `src/lib/species-search.ts`, so Jest can test them on their own.

### Automated checks

Run from `mobile/`.

| Check | Command | Result |
| --- | --- | --- |
| Unit and screen tests | `npm test` | Pass, 109 tests in 8 files (item 5 had 59 in 4) |
| Typecheck | `npm run typecheck` | Pass |
| Lint | `npm run lint` | Pass |
| Expo Doctor | `npx expo-doctor` | 20 of 21 pass. The one that fails is the known `ios.icon` false alarm from item 5 |
| Package versions | `npx expo install --check` | Pass, up to date |

New tests:

- `src/lib/__tests__/record-form.test.ts` and `species-search.test.ts` check the form rules and the
  species search on their own. The tests for ordering and the 4 suggestion limit use small made up
  lists, so they still mean something if the real list changes.
- `src/state/__tests__/records-context.test.tsx` checks the records store. New records go to the
  top as waiting to sync, every record gets its own ID and tag, and you can find one by its ID or
  tag.
- `src/__tests__/new-record-screen.test.tsx` renders the real New Record screen with Expo Router's
  testing library and uses it the way a person would: suggestions, the errors after leaving a box,
  the decimals error, the notes countdown, saving (it checks the new record's page opens), and an
  empty form for the next record.

The screen tests needed two new dev packages, `@testing-library/react-native` and
`react-test-renderer`, pinned to exact versions. Jest can't read CSS, so `jest/css-stub.js` stands
in for `global.css`, which the app only loads for the web.

The website wasn't changed in this item.

### Tests on the iOS simulator

The app started with the six mock records plus a few test ones from earlier, so 4 were waiting to
sync. The simulator panel types like a hardware keyboard, so the on-screen keyboard never opened,
and iOS made the first letter of each box a capital.

| # | Screen | What we did | What should happen | Result |
| --- | --- | --- | --- | --- |
| 1 | New Record | Opened the tab | The hint under Species says "Scientific name, like Shorea macrophylla", Height shows 12.5 as a placeholder, and the condition chips are Healthy, Damaged, Diseased and Dead | Pass |
| 2 | New Record | Typed "shor" as the species (iOS made it "Shor") | The hint changes to "Tap a match below, or keep typing if it isn't there." and one suggestion shows: *Shorea macrophylla* with "Engkabang, Engkabang jantong, Kawang jantong" under it, wrapping onto two lines without being cut off | Pass |
| 3 | New Record | Tapped the suggestion | Species becomes "Shorea macrophylla", the hint says "On the species list.", Common name fills in with "Engkabang" and the suggestion goes away | Pass |
| 4 | New Record | Typed 12.345 as the height, then left the box | Red border and "Use 2 decimal places at most, like 12.25" | Pass |
| 5 | New Record | Changed the height to 12.35 | The error goes | Pass |
| 6 | New Record | Picked Damaged and scrolled down | Save is turned on, with "You can save without a location, but try to capture one first." under it | Pass |
| 7 | New Record | Pressed Save record | Opens the new record with its own NNP tag: Shorea macrophylla, Engkabang, Pending sync, 12.35 m, Damaged, Today, 0 photos and "No location saved with this record." The My Records badge goes from 4 to 5 | Pass |
| 8 | New Record | Went back | The form is empty and back at the top, with Healthy picked | Pass |
| 9 | New Record | Tapped into Species, left it empty and moved on | "Add the species name." in red | Pass |
| 10 | New Record | Typed "Ficus sp." | The error goes and the hint says "Not on the species list. You can still save it." | Pass |
| 11 | New Record | Turned on dark mode, then typed "dur" | The form and the *Durio graveolens* suggestion use dark colours, the suggestion has a visible border, and all the text is easy to read | Pass |

### Not tested yet

| What | Why | Next step |
| --- | --- | --- |
| The keyboard on Android | There's no Android emulator on this Mac | In Expo Go on an Android phone, tap Height and then Notes, and check neither box ends up under the keyboard |
| VoiceOver and TalkBack | The simulator panel can't play a screen reader we can hear | On a real phone with VoiceOver or TalkBack on, leave Species empty and move on, and check it reads out "Add the species name." |
| The on-screen keyboard | The simulator panel types like a hardware keyboard | On a real phone, check Height opens the number pad with a decimal point, and "next" moves from Species to Common name to Height |
| The notes countdown on screen | Only Jest checked it, because typing 900 characters through the simulator panel takes too long | Paste a long note on a real phone and check the count shows at 100 left and stops at 0 |
| Uploading a record linked to *Durio graveolens* or *Dryobalanops aromatica* | They're on the app's list but not in the Supabase seed yet, so the species link would fail | Add both to the species table before item 10 uploads anything |
| Web | The phone is the real target, and item 5 already checked the layout in a browser | Quick check in a browser that the suggestions and errors show |

Real GPS (item 8) and photos (item 11) get their own test results.

### Security check

`npm audit` on 16 Oct 2026, after adding the two test packages.

**Website:** not changed in this item.

**Mobile:** 65 in total (16 moderate, 49 high), or 42 if you leave out dev tools. That's the same
five advisories as [item 5 round 2](item-5-mobile-skeleton.md#security-check) (`braces`,
`node-forge`, `uuid`, `decode-uri-component` and `sprintf-js`), so the new test packages didn't add
any. The table there says where each one comes from. The only one inside the app on the phone is
`decode-uri-component`, which Expo Router uses to read links, and fixing it needs Expo Router to
move to a newer `query-string`.

Don't run `npm audit fix --force`. It would drop Expo down to an old SDK and break the app.
