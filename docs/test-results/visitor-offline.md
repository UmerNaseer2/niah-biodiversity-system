# Visitor offline mode test results

One round so far, on 5 Nov 2026 on the iOS simulator, against the stand-in. Until now the phone app
was only for park staff. Now it's for visitors too: the first time it opens, it asks if you're
visiting the park or work there. Visitors don't sign in, and the app keeps its own copy of the
public plant info, so scanning a plant's QR tag works with no signal. The copy updates when the
phone has signal, so plants that get approved later show up after the next update.

[docs/sync-design.md](../sync-design.md) has the rules, under "Plant info for visitors". This file
is what we built and what happened when we tried it.

## Round 1: 5 Nov 2026, iOS simulator

Run on Umer's Mac (Node 22.22.3) on `visitor-offline-mode`, in Expo Go 57.0.9 on an iPhone 17 Pro
simulator (iOS 26.5). The server was the stand-in (`supabase/tests/stand-in.js`), which runs our
real SQL files with made up accounts and made up records. No hosted project was touched.

- Before trying anything, we checked that the app Expo Go loaded had the stand-in's address in it
  and none of the hosted project's details.
- The stand-in's log shows each request it gets, so we could see what the app asked for.
- The simulator has no camera and Expo Go's camera is refused there, so tag codes were typed in. A
  typed code goes through the same lookup and gets saved to History the same way.
- To lose signal we stopped the stand-in. The simulator still says it's online, so the app shows
  the couldn't update message, not the no signal one.
- `npx expo start --localhost` only listened on `[::1]:8081`, while Expo Go asked for the app at
  `127.0.0.1:8081`, so it wouldn't load. Starting Metro without `--localhost` worked.

### What we built

- **Visiting or working.** The first time the app opens, a welcome page asks "I'm visiting the
  park" or "I work at the park", and it doesn't ask again. A phone that already has records or has
  synced skips the question and opens as staff. Visitors get Home, Scan, Plants, History and
  Settings, with no sign in. Staff keep Home, Scan, New Record, My Records and Profile. Settings and
  a signed out Profile each have a card to switch, and switching leaves the phone's records where
  they are. A link to a page the other kind of user gets opens Home instead.
- **The plant info saved on the phone.** It goes in its own tables, apart from the staff records,
  with no location columns. The phone never asks for the location column. Each download swaps the
  whole copy in one go, so a download that fails leaves the old copy as it was.
- **When it updates.** When the app opens or comes back to the front, when the connection comes
  back, every 10 minutes while it's open, and when someone presses Update now on Settings or Try
  again on Home. The automatic ones are skipped if the last one that worked was less than 5 minutes
  ago, and only one runs at a time.
- **Scanning with no signal.** A scanned or typed tag is looked up in the saved copy. If there's no
  info for it, the page says so, and that it'll show once the phone is online and the plant info
  updates. A staff scan opens the record on the phone first, and only uses the saved copy when no
  record on the phone has that tag.
- **The plant page.** The names, family, IUCN status and Sarawak protected badge, the summary and
  species sections, this plant's height, condition and the day it was recorded, the species photo,
  More about this species, and when the info came down. There's no map and nothing about where the
  plant is.
- **Plants and species pages.** Plants lists every species, with search and the same filter as the
  website (Threatened is VU, EN or CR). A species page lists its tagged plants under "Tagged in the
  park".
- **History.** The tags scanned on that phone, newest first, kept only on the phone. Tags with no
  info go in too, and Clear history asks first.
- **Photos saved offline.** After each update that works, the main photo of each species comes
  down, one at a time. It has to come from that species' folder in the public `botanical-photos`
  bucket or be an https link. The phone never asks for the field team's record photos. A photo over
  5 MB, or one taking over a minute, is stopped. The web build doesn't download photos.

How the code is split:

- `mobile/src/app/welcome.tsx` and `mobile/src/hooks/use-switch-mode.ts`: the first question, and
  switching between visiting and working.
- `mobile/src/sync/public-copy.ts` and `mobile/src/sync/supabase-public-api.ts`: downloading the
  plant info, and what it asks Supabase for.
- `mobile/src/state/public-copy-context.tsx`: when the plant info updates.
- `mobile/src/sync/public-photos.ts`, `mobile/src/lib/species-photo-files.ts` and
  `mobile/src/db/kept-photos.ts`: downloading and keeping the species photos.
- `mobile/src/app/plant/[tag].tsx` and `mobile/src/app/species/[slug].tsx`: the plant and species
  pages.
- `mobile/src/app/(tabs)/plants.tsx` and `mobile/src/app/(tabs)/history.tsx`: the Plants and
  History tabs.

### Automated checks

| Check | Result |
| --- | --- |
| Jest (`npx jest`) | 51 suites, 1130 tests, all pass |
| Mobile `npx tsc --noEmit` | No errors |
| `npx expo lint` | No problems |
| `npx expo-doctor` | 20 of 21 checks pass |
| Database tests (`supabase/tests`, `npm test`) | 420 tests in 79 suites, all pass |

The check that failed in expo-doctor is the package versions one. 8 Expo packages are one patch
behind what Expo expects now, for example `expo` is 57.0.31 and Expo wants 57.0.32. This branch
doesn't change any packages, so that's left for an update of its own. Going by
`.github/workflows/ci.yml`, CI's Expo Doctor step only lets the known `ios.icon` message through,
so that step will fail too until then.

The website and the SQL files weren't changed, so the website checks weren't run again.

The new `supabase/tests/visitor-reads.test.js` takes the column lists out of
`supabase-public-api.ts`, pins them, and runs the same reads against our SQL files with no account
and as a botanist. It also checks the phone only reads the public views and the public photo
bucket. The pinned record columns leave out the location column.

To check the new tests catch real bugs, we broke the code on purpose, one change at a time, and put
it back after each run:

| Code we broke | Tests run | Caught |
| --- | --- | --- |
| The photo download in `species-photo-files.ts` | Its own tests | 46 of 47 |
| The species photo code in `kept-photos.ts`, `records-store.ts` and `records-store.web.ts` | The store and kept photo tests | 40 of 40 |
| Which tabs and pages each kind of user gets | `welcome-screen.test.tsx` | 7 of 7 |
| The reads in `supabase-public-api.ts` | `visitor-reads.test.js` | 11 of 11 |

The one not caught takes `size` out of the first `Math.max` in `species-photo-files.ts`, the one
that runs while the photo comes down. In a real download the numbers only go up, so the newest ones
are already the biggest and taking `size` out changes nothing. We left it.

### What we tried

| Test | What happened |
| --- | --- |
| Open the app on the simulator, which had staff records from before | Staff tabs on Profile, signed out, with no welcome page |
| Profile, I'm visiting the park | Visitor tabs, with no sign in |
| Home | "Ready offline", 8 tagged plants and Last updated |
| Settings | The Plant info card with Last updated and Update now, and the Work at the park? card |
| Plants | All 7 species, with a photo on each one that has one |
| Search "nepenthes" | "Showing 1 of 7 plants", the Pitcher plant |
| Threatened filter | 3 of 7 |
| The Belian species page | NNP-3F2A9C under Tagged in the park |
| The plant page for NNP-3F2A9C | This plant card, the species photo with "This photo shows the species, not this plant.", More about this species and Back. No map or location |
| Type NNP-D00D01, the stand-in's test tree | Only the cards that have info |
| Type NNP-ABC123 | No plant info for this tag yet |
| History | Newest first, with "No plant info yet" on NNP-ABC123 |
| Stand-in stopped, type NNP-3F2A9C | Opened in full with the photo from the saved file (6 photo files on the phone), and moved to the top of History |
| Stand-in stopped, Update now | "Updating..." for several seconds, then the couldn't update message. Last updated didn't change |
| Stand-in started again, publish the waiting Tapang record NNP-D00D03 | Done as the stand-in's officer account, by a small script making the same change as Approve |
| Update now | "Plant info updated.", and Last updated went from 9:29 am to 9:37 am. The log showed each public list read twice (a page, then an empty page) and nothing else from the app |
| Home | 9 tagged plants |
| Type NNP-D00D03 | 31 m, Diseased, recorded 12 Oct 2026, the photo and sections, "Info from today, 9:37 am", and no location |
| More about this species | The Tapang page listed NNP-D00D03 (31 m, 12 Oct 2026, Diseased) above NNP-B17D03 (52 m, 1 Oct 2026, Healthy) |
| Plants | Still 7 species, with Tapang on 2 tagged plants |
| History | NNP-D00D03 on top. Tapping it opened its page and didn't change its time |
| Settings, I work at the park | Staff tabs on Profile, signed out, with the phone's 16 records still there |

### What we found and fixed

Nothing in the app needed a fix. The `jest/` list in `mobile/README.md` had been missing
`expo-file-system.js` and `expo-image-manipulator.js` since 1 Nov, and both are in it now.

### Not tested

- **A real camera.** The simulator has none, and Expo Go's camera is refused there, so every tag was
  typed. Reading QR codes is covered by Jest and by [item 6](item-6-qr-scanner.md), and Jest covers
  what a visitor's scan does next (`mobile/src/__tests__/scan-plant-info.test.tsx`).
- **A real phone with no signal.** The "No signal right now" messages weren't seen on screen. Jest
  covers them.
- **The automatic updates.** Only Update now was pressed.
  `mobile/src/state/__tests__/public-copy-context.test.tsx` covers when the others run.
- **A staff scan falling back to the saved plant info.** Jest covers it, under "Staff scanning a
  tag" in `scan-plant-info.test.tsx`.
- **A connection that stalls** instead of failing wasn't tried in this round. See Known limits
  for the time limit added after it, and how it was checked.
- **Android, the web build, dark mode and a screen reader.**
- **Hosted Supabase and a real phone.** Nothing was tried against the hosted project. It needs the
  SQL files run in order first, see [supabase/README.md](../../supabase/README.md).

### Known limits

- **The app has to be opened with signal once.** The plant info only downloads while the app is
  open, so a phone first opened in the park with no signal has nothing to show until it gets signal.
- **A phone that looks connected but has no real signal** gets the couldn't update message instead
  of the no signal one, like the simulator here.
- **Fixed on 5 Nov, after this round:** the build tested here set no time limit of its own on its
  requests. On the `visitor-time-limits` branch, a request with no answer is stopped after 30
  seconds, or a minute for a photo upload, and counts as no signal. `stalled-server.test.ts` in
  `mobile/src/sync/__tests__` covers it, and in the simulator, with the stand-in paused, Update now
  said it couldn't update the plant info somewhere between 21 and 36 seconds in. See "Requests that
  get no answer" in [docs/sync-design.md](../sync-design.md).
- **A read that fails straight away is still tried up to 3 more times**, waiting 1, 2 and then 4
  seconds, which is why Update now took several seconds with the stand-in stopped.
- **Every update gets the whole plant info again**, because `records_public` has no `updated_at`
  column.
- **Only the main photo of each species comes down, at full size.**
- **The web build keeps the plant info, History and the visiting or working answer in memory
  only**, so they're gone when the page reloads, and it doesn't download photos.
