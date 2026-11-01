# Item 11 test results: taking photos and sending them up

One round so far, on 1 Nov 2026 on the iOS simulator, against the stand-in. Until now a record on
the phone had no photos. This item lets a botanist add up to 5 photos to a new record, keeps them on
the phone with it, and sends them up after the record the next time there's signal. An officer can
then see them on the website.

[docs/sync-design.md](../sync-design.md) has the rules. This file is what we built and what happened
when we tried it.

## Round 1: 1 Nov 2026, iOS simulator

Run on Umer's Mac on `item-11-photos`, in Expo Go 57.0.9 on an iPhone 17 Pro simulator (iOS 26.5).
The server was the stand-in (`supabase/tests/stand-in.js`), which runs our real SQL files with made
up accounts and made up records. No hosted project was touched. To lose signal on purpose, the phone
talked to the stand-in through a small proxy on the Mac that could drop connections. It could drop
all of them, only the photo uploads, or only the answer to a photo upload after the stand-in had
already saved the photo.

### What we built

- **Adding photos.** The New Record form has a Photos card with "Take photo" and "Choose from
  library". A record can have up to 5. The proposal doesn't set a number, so that's our choice. Each
  thumbnail has an X to remove it.
- **Smaller files.** Each photo is saved as a JPEG at quality 0.7, with the longest side cut to 2048
  pixels. A smaller photo isn't made bigger. In our test a 3000x2000 photo of about 2 MB came out at
  2048x1366 and about 900 KB.
- **The GPS block comes out.** A photo from the library can say exactly where it was taken, and some
  of these plants are protected, so every photo gets written out again from its pixels, even a small
  one. See "The GPS check" below for what stays in the file.
- **Saved straight away.** Photos go in the app's document folder, because the phone can clear its
  cache whenever it's low on space and these can be the only copy for days. Photos left on the form
  when the app was closed get cleaned up the next time it opens.
- **Records first, then photos.** The proposal asks for this, because a photo with no record on the
  server is no use to anyone. A photo goes to `<account ID>/<record ID>/<number>.jpg`.
- **Only the account that sent the record sends its photos.** The website looks for them in that
  account's folder, and nobody else can write there. If someone else signs in, the photos wait, and
  the phone says so.
- **Signing out warns about photos as well.** It says how many are waiting and that they only go up
  once that account signs in again.
- **Saying where they've got to.** The record's page has a Photos card with the thumbnails and one
  of: "They go up after the record does.", "2 photos still on this phone only." or "On the server as
  well." My Records and Profile count what's waiting.
- **When something goes wrong.** A file that's gone or a photo the server turned down shows in red
  on the record, and the other photos still go up. Pressing Sync now tries a turned down photo
  again.

How the code is split:

- `src/lib/photo-files.ts` saves, reads and deletes the files. `src/hooks/use-photo-capture.ts` runs
  the camera, the library and the permissions. `src/components/photo-capture.tsx`, `photo-thumb.tsx`
  and `record-photos.tsx` are what you see.
- `src/db/database.ts` adds a `record_photos` table and `plant_records.uploaded_by` (version 6).
  `src/db/records-store.ts` saves a record and its photos in one transaction.
- `src/sync/sync-engine.ts` sends the photos after the records. `src/sync/upload-row.ts` reads the
  answer, and `src/sync/supabase-api.ts` makes the real call.

No new SQL was needed. 005, 009, 014 and 020 already had the bucket, the policies and the folder.
The number 018 was held in case this item needed a file, and it didn't, so no 018 file exists.

### Automated checks

| Check | Result |
| --- | --- |
| Jest (`npx jest`) | 29 suites, 664 tests, all pass, no act warnings |
| `npx tsc --noEmit` | No errors |
| `npx expo lint` | No problems |
| `npx expo-doctor` | 21 of 21 |
| SQL tests (`cd supabase/tests && npm test`) | 411 pass, 5 of them new in `phone-reads.test.js`. They send the phone's kind of upload through the real policies |

The Jest tests use a fake file system and a fake image library (`jest/expo-file-system.js` and
`jest/expo-image-manipulator.js`), so the file and JPEG results below only come from the simulator.

### What we tried

| What we did | What should happen | Result |
| --- | --- | --- |
| Picked two photos from the library, then removed one thumbnail | Both show, the removed one's file is deleted | Pass |
| Reloaded the app with photos on the form | The form is blank and those files get removed | Pass |
| Refused the camera permission | A warning and an "Open Settings" button, and nothing breaks | Pass |
| Saved a record with 2 photos with no signal, then pressed Sync now | Record stays pending, photos say they go after it, "Can't reach the server right now" | Pass |
| Signal back, Sync now, with an expired token | Token refreshed, record then photos 1 and 2 go up, "1 record uploaded. 2 photos uploaded." | Pass, in that order in the stand-in's log |
| Compared the server's copies with the phone's files | Same size and same sha256 | Pass |
| Opened the record's edit page on the website as an officer | Both photos show at the right size | Pass |
| Dropped only photo uploads while saving a record | Record shows Synced, photos say "still on this phone only" and My Records counts them | Pass |
| Lost the answer after a photo reached the server, then let signal back | The rerun gets "already there" and counts it as done. No photo lost, no second copy | Pass |
| Signed out with a photo waiting | Warns, and the photo stays | Pass |
| Signed in as a second botanist | Photo waits. Sync now says "Nothing new to upload." and the stand-in's log has no request for it | Pass |
| Signed back in as the first botanist | The automatic sync sends the photo | Pass |
| Deleted one photo's file on purpose, then Sync now | The other photo goes up. The record says photo 2 isn't on the phone any more | Pass |
| An officer deleted a record whose insert got through but whose answer was lost | Sync gets turned down, no photo is sent, the record offers "Remove from this phone", and removing it deletes its photo files | Pass |
| Another record on the server took the tag code | "Get a new tag" gives a new ID, and the photos follow it to the new folder and match by sha256 | Pass |

### The GPS check

We made two test photos with a made up GPS block and added them to the simulator's library, then
read the actual bytes of each file. The picker's footer said "Location Is Included", so the test
does start with location in the file.

- The source files have the GPS pointer in their Exif block. The saved files and the server's copies
  don't.
- A small Exif block does stay in the saved file. It only has the orientation, the resolution, the
  colour space and the pixel sizes, plus a short Photoshop block with no GPS in it. So the accurate
  claim is "the GPS block is removed", not "all the metadata is removed".

### What we found and fixed

- **The picker's own copy kept the full GPS block.** `removeFromCache` only looked under
  `Paths.cache`, and in Expo Go the picker writes to a different folder. **Fixed on 1 Nov:** it
  checks the picker's folder name too, with a test, and that folder now stays empty after each pick.
- **`expo-image` kept a full copy of every thumbnail on disk**, which would stay after the record
  was deleted. **Fixed on 1 Nov:** thumbnails use `cachePolicy="memory"`, and its disk cache now has
  no copies of them.
- **Our own code comment said the Exif block is left out**, and the check above showed a small one
  stays. **Fixed on 1 Nov:** the comment says what's true now.
- **The banner said the same thing twice** right after a sync with a problem, once as "also couldn't
  upload last time" about the same record. **Fixed on 1 Nov:** a line is hidden when the last sync's
  message already says it, with tests.

### Not tested

- **A real camera.** The simulator has none, so "Take photo" has only been through Jest and the
  refused permission. Camera photos and the camera's own cache copy still need the same byte check.
- **Android.** That includes Android's way of getting a photo back after the system closes the app,
  and how it handles the orientation. The Android config does ask for the old storage permissions on
  Android 12 and below (`READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE`, from the image picker
  and file system packages).
- **A real phone**, real signal, and how long an upload takes on it.
- **Hosted Supabase.** Only the stand-in's Storage answers have been seen. The phone reads real
  Storage's errors from what its library's code says they look like, so "already there" needs
  checking on hosted, once 003 to 021 are run.
- **What a missing photo's thumbnail shows after the app reopens.** It kept showing from memory in
  our test.
- **A screen reader.** The thumbnails and buttons have labels, but nobody has used them with one.

### Known limits

- Photos can only be added while making the record, because `photo_count` goes up with the record
  and the phone can't edit a record yet.
- A photo left waiting can still upload after an officer deletes its record, because the policy only
  checks the folder. It would sit in Storage with no record. It would take a new SQL file to stop.
- If a record's insert got through, the answer was lost and a different account then retried, the
  phone would record the second account, so its photos would land where the website won't look. This
  is rare, since it takes a lost answer and a change of account.
- If a file goes missing, `photo_count` on the server stays higher than the photos that are there.
- Photos stay on the phone after they've gone up, so thumbnails work with no signal. Nothing clears
  them, and they're plain files with no encryption of their own (see
  [encryption at rest](../security/encryption-at-rest.md), item 22).
- A synced record that an officer deleted stays on the phone with its photos, since the phone
  doesn't learn about it (item 10 works the same way).
- There's no full screen view of a photo on the phone.
- A very slow upload holds up the sync until the phone gives up, since we don't set a timeout.
- "N photos uploaded" can count one that was already there after a lost answer.
- The banner's message from the last sync stays until the next sync, even once the record it talks
  about has been removed.
- In Expo Go the permission prompt shows Expo Go's own sentence, not ours from `app.json`.
