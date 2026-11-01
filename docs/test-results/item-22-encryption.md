# Item 22 test results: encrypting the records file on the phone

One round so far, on 1 Nov 2026 on the iOS simulator. Until now `niah.db` was a plain SQLite file in
the app's own folder, so only the phone's own encryption protected it. This item encrypts the whole
file with SQLCipher in development and store builds. Jason started it on `item-22-data-encryption`,
and their commit is in the history. We merged it and then rewrote the unlock part, because
[the notes on it](../security/encryption-at-rest.md) listed what it still needed.

## Round 1: 1 Nov 2026, iOS simulator

Run on Umer's Mac on `item-22-encryption`, in a development build made with `npx expo run:ios`
(Xcode 26.5, iPhone 17 Pro simulator, iOS 26.5). The server was the stand-in
(`supabase/tests/stand-in.js`), with made up accounts and made up records. No hosted project was
touched. Expo Go 57.0.9 was used to check it stays plain.

To check the file really is encrypted, we opened it from the simulator's app folder on the Mac with
`sqlite3` and no key, and searched its raw bytes for words that have to be in it.

### What we built

- **The whole file is encrypted.** `useSQLCipher` is on in `app.json`, so development and store
  builds come with SQLCipher. That covers `niah.db` and its `-wal` file.
- **A random key for each phone.** 32 random bytes from `expo-crypto`, saved in `expo-secure-store`
  before anything uses them, then given to SQLCipher as raw bytes, which skips the slow step that's
  only needed for passwords. The Keychain setting is `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, so the
  file still opens while the phone is locked, and the key doesn't go into backups.
- **A phone with a plain file gets it encrypted the first time it opens.** `sqlcipher_export()`
  copies it into `encrypting-niah.db`, every table's rows get counted against the original, and only
  then does the copy replace it. The version number comes across too, so the migrations don't run
  again.
- **Being cut off part way is fine.** The plain file is only deleted once the copy has checked out.
  The next open throws away a half made copy, or finishes moving a complete one.
- **A clear screen when the key is gone.** If this phone's key can't read the file, the app says so
  and stops, with no Try again. It doesn't make a new key and doesn't delete anything, so the
  records can still be read if the key ever comes back.
- **Every connection gets the key.** `withExclusiveTransactionAsync` opens its own connection, so
  saving a record would fail without it. `unlockConnection` handles that.
- **Expo Go and the tests stay plain.** Neither has SQLCipher. A release build without it refuses to
  open the records, so a build mistake can't quietly turn the encryption off.

How the code is split:

- `mobile/src/db/encryption.ts`: the key, unlocking, and encrypting a plain file
- `mobile/src/db/database.ts`: asks `encryption.ts` for an open file, then runs the migrations
- `mobile/src/db/records-store.ts`: unlocks the second connection in `inOwnTransaction`
- `mobile/src/state/records-context.tsx`: the screen for when the records can't be unlocked
- `mobile/app.json`: `useSQLCipher`, plus `com.niah.groundtruthing` as the iOS and Android app ID,
  which a build has to have. It's worth a team check before any store release
- `mobile/package.json`: `npm run ios` and `npm run android` now make a development build, which is
  what `expo prebuild` writes there

### What changed from Jason's branch

Their idea stays: a random 32 byte key in `expo-secure-store`, with the file unlocked before the
migrations. These parts changed:

- `app.json` didn't turn SQLCipher on, so the branch would have stopped with an error on every run.
- `PRAGMA rekey` only works on a file that's already encrypted, so a plain file now goes through
  `sqlcipher_export()`.
- Expo Go used to stop with an error. It stays plain now, so the team can keep testing in it.
- The key is used as raw bytes, and it has the Keychain setting above.
- Two opens at the same moment could have made two keys, so opens now go one at a time.

No phone has a file from the old code, because without `useSQLCipher` it could never open one.

### Automated checks

| Check | Result |
| --- | --- |
| `npx jest --no-cache` | 33 suites, 744 tests pass, 22 of them new |
| `npx tsc --noEmit` | Clean |
| `npx expo lint` | Clean |
| `npx expo-doctor` | 21 of 21 |
| `npx expo run:ios` | Builds, 0 errors |

The Jest tests use a stand-in that treats keys the way SQLCipher does, so they cover the logic but
not real encryption. The rounds below are what prove the real thing.

### What we tried

| # | What we did | What should happen | Result |
| --- | --- | --- | --- |
| 1 | Installed the development build fresh | The app opens and the tables get set up. `sqlite3` says "file is not a database". The first bytes aren't "SQLite format 3", and table names can't be found in the file or its `-wal` | Pass |
| 2 | Signed in as a test botanist and pressed Sync now twice | Both work on the encrypted file | Pass |
| 3 | Saved a record with a library photo and a made up species | It saves using the second connection, then uploads with its photo. The stand-in has it. `sqlite3` still refuses the file, and the species, tag code and table names can't be found in the file or its `-wal` | Pass |
| 4 | Force quit and reopened | The record is still there | Pass |
| 5 | Put a plain file from Expo Go in place, with 6 synced records, on a phone with a key already saved | It gets encrypted on opening. All 6 are there, writes work, and the migrations didn't run again. `sqlite3` refuses it, and the old text can't be found in any of the 3 files | Pass |
| 6 | The same with no key saved, like the first run after updating the app | A new key gets made, the file gets encrypted and it opens | Pass |
| 7 | Left a complete `encrypting-niah.db` with no `niah.db`, like being cut off during the swap | It's moved into place and opens with its records | Pass |
| 8 | Put a half made `encrypting-niah.db` of random bytes next to a plain `niah.db` | It's thrown away and the plain file gets encrypted again, with nothing lost | Pass |
| 9 | Cleared the Keychain with an encrypted file on the phone | The "can't be unlocked" screen, with no Try again. No new key made, and `sqlite3` still refuses the file | Pass |
| 10 | Saved a new record so it was still in the `-wal`, force quit, renamed the key in the code so the app couldn't find it, opened, then put the name back and opened again | The "can't be unlocked" screen, then every record back, the new one included | Pass, the new record is back at the top, still Pending |
| 11 | Opened the app in Expo Go again | It runs as before, and `sqlite3` reads its file, version 6, with 6 records and 7 species | Pass |
| 12 | Loaded the web build in a browser | Home shows, and no errors in the console | Pass |

### What we found and fixed

- **The "can't be unlocked" screen does change the file a little.** In test 9 we expected the bytes
  to stay the same, but the file's checksum changed and the `-wal` went away. When the connection
  with no key closes, SQLite does its normal tidy up and copies the `-wal` pages into the main file.
  Those pages are already encrypted, so it doesn't need the key for that. Test 10 was added to check
  nothing is lost that way, and nothing was. So what the screen says, "Nothing here has been
  changed", is true of the records but not of the exact bytes.
- **A warning that looked serious wasn't.** Metro logged "Couldn't finish syncing" with
  `AccessClosedResourceException` a few times. Those came from Fast Refresh reloading the app while
  we edited the code, which only happens in development. The count stayed at 3 through all the
  saving and syncing after that.

### Not tested

- Android, because Umer's Mac has no Android SDK. The code path is the same, and it needs its own
  run.
- Real phones of any kind.
- A release build. The test for a build with no SQLCipher is a unit test.
- A real update from an installed older version. Tests 5 and 6 copied a plain file in by hand.
- How long saving takes with SQLCipher on. The proposal's target is under 1 s, and it needs timing
  on a real phone.
- Jason hasn't reviewed the changes yet.

### Known limits

- Photos aren't in the database, so SQLCipher doesn't cover them. They're plain JPEG files in the
  app's own folder, with the GPS block taken out. The phone's own encryption is what protects them.
- This protects a copy of the file, like one from a backup. Someone who can unlock the phone and
  open the app can still see the records, so phones still need a passcode.
- A plain file from before the update is deleted after encrypting, but flash storage can keep old
  bytes until they get reused. That only affects a phone that had a plain file.
- A phone restored from a backup, or a new phone, can't open the records, because the key stays on
  the old phone. Anything that hadn't uploaded is lost that way unless the old phone is still
  around.
- Real use now needs a development or store build. Expo Go files are plain, and it's only for trying
  things with made up data. Expo Go with `--no-dev` won't open the records, because of the rule for
  release builds.
- Expo SDK 57 needs iOS 16.4 or newer, so the proposal's iOS 15 target can't be met.
