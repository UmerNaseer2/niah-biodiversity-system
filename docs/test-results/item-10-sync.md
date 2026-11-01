# Item 10 test results: syncing the phone with the server

One round so far, on 31 Oct 2026 on the iOS simulator, against the stand-in. Until now the phone
kept everything to itself. This item adds signing in, uploading waiting records, reading back what
officers decided and downloading the species list. It also finishes the phone half of item 2, since
signing in lives on the Profile tab. Photos came later, see [item 11](item-11-photos.md).

[docs/sync-design.md](../sync-design.md) has the rules. This file is what we built and what happened
when we tried it.

## Round 1: 31 Oct 2026, iOS simulator

Run on Umer's Mac on `item-10-sync`, in Expo Go 57.0.9 on an iPhone 17 Pro simulator (iOS 26.5).
The server was the stand-in (`supabase/tests/stand-in.js`), which runs our real SQL files with made
up accounts and made up records. No hosted project was touched. Metro was started with the two
`EXPO_PUBLIC_` values set to the stand-in, and we checked the bundle had the stand-in's address in
it and no `.supabase.co` one.

### What we built

- **Signing in.** Email and password on the Profile tab. The session goes in the phone's keychain
  with `expo-secure-store`, split into parts because some iOS versions turn down long values
  (`src/lib/chunked-storage.ts`).
- **Staying signed in with no signal.** Being signed in doesn't depend on reaching the server, so
  the app still opens signed in with an expired token in the forest. Only the server can end a sign
  in, and it can only do that once the phone reaches it.
- **Uploading on its own.** The phone syncs when someone signs in or opens the app signed in, when
  the app comes back to the front, when signal comes back, when a new record is saved, and every 60
  seconds while a record is waiting. Sync now is there as well, and it also tries records that came
  back with a problem.
- **One sync at a time.** `src/sync/sync-engine.ts` uploads what's waiting, reads back officers'
  decisions, then downloads the species list. It checks the session before every upload, because
  with no session the request would go out with the anon key, and the server's "not allowed" would
  wrongly get blamed on the record.
- **What officers decided.** A rejected record shows a red "Rejected" tag and the officer's reason.
  An approved one says "Approved".
- **Tag clashes.** If the server already has that tag code, the record shows why and offers "Get a
  new tag", which warns that a tag already on the plant has to be swapped.
- **Signing out.** It warns if records are still waiting, and works with no signal.

How the code is split:

- `src/sync/sync-engine.ts`: one sync from start to finish, with no Supabase or React in it, so a
  fake server can test every path.
- `src/sync/supabase-api.ts`: the real server calls.
- `src/state/sync-context.tsx`: decides when to sync.
- `src/state/account-context.tsx`, `src/lib/account.ts`, `src/lib/supabase.ts`: signing in.
- `supabase/tests/phone-reads.test.js`: checks the phone's exact read queries against our SQL.

### Automated checks

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | Pass |
| `npx expo lint` | Pass, no warnings |
| `npm test` in `mobile` | 539 of 539 pass, in 26 suites (364 in 19 on `main` before this) |
| `npx expo-doctor` | 21 of 21 pass |
| `node --test phone-reads.test.js` in `supabase/tests` | 9 of 9 pass |

### What we tried on the simulator

For "no signal" we put a small switch in front of the stand-in that drops every connection. The
phone can't see the switch, so it still thinks it has Wi-Fi. That makes it a harder test than flight mode,
because nothing tells the app signal came back and the 60 second retry has to notice. It also means
we haven't tried the "signal came back" trigger on the simulator, only with a fake in the tests.

Tokens were set to last 120 seconds so they would expire during the test.

| What we did | What happened |
| --- | --- |
| Opened Profile signed out | Sign in form, plus records on the phone, waiting, synced and "Last synced: Not yet" |
| Signed in with the wrong password | "That email and password don't match an active account." Password box cleared |
| Signed in as a new botanist | Name, email and Botanist shown. The 2 waiting records went up as one row each under that person |
| Typed a species only the server has, with no signal | The form suggested it, so the species list had downloaded and stayed on the phone |
| Saved a record with no signal | Showed Pending sync, and it wasn't on the server. My Records said it was safe to leave and would go up on its own |
| Pressed Sync now with no signal | "Can't reach the server right now. Your records are safe on this phone and will go up once it can." Record still pending |
| Opened the app with a session the server no longer knew | "Your sign in ended, so sign in again to sync. Your records are safe on this phone." Sign in form, same counts |
| Signed in as someone else with a record waiting | It uploaded as one row in that person's name, which is the known limit below |
| Saved with no signal, then brought signal back | One row on the server after 80 seconds, and the open record changed to Synced by itself |
| Saved with no signal, waited for the token to expire, reopened the app | Still signed in with no "sign in ended" notice, counts right, location captured fine |
| Brought signal back after that | The token refreshed by itself, and one row was on the server after 85 seconds |
| Rejected a record on the server with a reason, pressed Sync now | Red "Rejected" tag in the list, and the reason on the record's page |
| Put a row with the same tag code on the server first, then synced | Red "Couldn't upload", and the server still had just the one row with that tag. The page explained and offered "Get a new tag" |
| Pressed "Get a new tag" and confirmed | New tag code and record ID, one new row on the server within 6 seconds, and the other person's row untouched |
| Pressed Sign out with a record waiting | "1 record is still waiting. It stays on this phone, and it'll upload under whoever signs in next." The 3 development samples aren't counted |
| Pressed "Keep me signed in" | Back to the normal card, still signed in |
| Signed out with no signal and an expired token | Straight to the sign in form, with no "sign in ended" notice and the same counts |
| Reopened the app after that | Still signed out |
| Signed in with no signal | "There's no signal, and signing in the first time needs it. You can still save records, and they stay on this phone until you sign in." Email kept, password cleared |
| Signed in again with signal | The record left waiting went up as one row under that person within 6 seconds. Waiting back to the 3 samples |

The 80 and 85 seconds were each measured once, so they show it's under the 5 minute target in these
runs, not how long it always takes. We don't know for sure why they're over 60, but an attempt still
waiting on token refresh retries when signal came back is the likely reason.

### What the testing found

All three are fixed, with tests:

1. "Nothing new to upload." stayed on screen next to "4 records waiting to sync" after saving a new
   record with no signal. Saving a new record now clears it.
2. "Nothing new to upload. 1 record couldn't upload." read as if nothing was wrong. It now only says
   nothing new when there's nothing else to say.
3. A sync still running when someone signed out left "You need to sign in again" under This phone.
   A sync that ends after signing out now says nothing.

### Not tested

- **Android and real phones.** Everything here was on one iOS simulator.
- **Hosted Supabase.** Only the stand-in. The hosted project needs SQL 003 onward before the phone
  can sync with it, and only Umer can run those.
- **Real poor signal.** A dropped connection is cleaner than a weak one that keeps half working. We
  also haven't seen a request cut off after the server saved it, except in the tests.
- **The "signal came back" trigger on a phone**, for the reason above.
- **A screen reader.** The messages are announced in the code, but nobody has listened to them.
- **The 0% data loss target.** Nothing was lost in this round, and the tests cover each failure we
  could think of, but that's not the same as measuring it in the field.

### Known limits

- There's no background sync, so records only go up while the app is open.
- Uploads go in the name of whoever is signed in when the sync runs, not who saved the record.
  Signing out warns about it.
- The iOS keychain outlives the app, so a session can survive uninstalling it.
- Signing out with no signal can't tell the server. The token just runs out.
- Sync now tries rejected uploads again, which is harmless but makes one extra request each.
- A synced record an officer deleted stays on the phone as synced.
- After opening the app with no signal and an expired token, the sync button is greyed out as
  "Syncing..." for about 30 seconds while the token refresh gives up.
- The phone has no forgot password page, like the website. It says to ask an admin for a new link.
- Development builds count the sample records in "Waiting to sync", so that number is 3 too high in
  this test. Samples never upload and never trigger the sign out warning.
