# Item 22: encryption at rest

How the system's data is protected while it's stored. This page says where each copy of the data
lives, what protects it, and what's still to test.

Status on 1 Nov 2026: Supabase and the phones' own encryption cover the data, and a development or
store build of the phone app also encrypts its records file with SQLCipher. That part has only been
tested on the iOS simulator, see the [item 22 results](../test-results/item-22-encryption.md).

## Where the data is stored

| Where | What's there | How it's protected | Status |
| --- | --- | --- | --- |
| Supabase database | Species, profiles, sensor nodes, and records with their exact GPS points | Supabase encrypts all customer data at rest with AES-256. Row Level Security then decides who can read each row (item 4) | Done by Supabase |
| Supabase Storage | `record-photos` from the phone (005) and `botanical-photos` for the plant pages (001 and 006) | The same AES-256 at rest. `record-photos` is private, because a photo can show where a plant is, so only the uploader, officers and admins can open one | Done (our SQL, tested below) |
| Database backups | A full copy, exact GPS points included | Supabase makes daily backups on the Pro plan and up (Pro keeps 7 days). On the free plan it asks you to export the data yourself with `supabase db dump`. A dump has every exact point, so it goes on an encrypted drive, never in the repo or a shared folder | Not decided yet |
| The phone's database (`niah.db`) | Records saved offline, with exact GPS points | SQLCipher encrypts the whole file in development and store builds, with a random key kept in `expo-secure-store`. It's also in the app's own folder, and iOS Data Protection and Android's file based encryption cover it as long as the phone has a passcode. Expo Go has no SQLCipher, so its file stays plain | Done on the simulator (item 22) |
| The phone's photos (item 11) | Record photos waiting to upload, and the ones already sent, with the GPS block taken out | Plain JPEG files in the app's own folder, so the same iOS and Android protection as `niah.db` and nothing on top. SQLCipher wouldn't cover these, because they aren't in the database | Partly done |
| The phone's sign in (item 10) | The Supabase session | `expo-secure-store`, which uses the iOS Keychain and the Android Keystore. Never SQLite or a plain file | Done on the simulator (item 10) |
| The website | Nothing. Pages read Supabase on every visit, and a signed in officer's browser only holds the Supabase sign in cookie | Nothing stored on our side to encrypt | Nothing to do |
| The repo | Code and made up data. The repo is public | No keys or passwords in it. `.env` files are gitignored, and only the `.env.example` files are committed | Done (tested below) |
| ESP32 sensor nodes (item 28) | The WiFi password and the device's own credentials | Kept in `secrets.h`, which is gitignored, with a `secrets.example.h` committed instead | Done in the code, not on real hardware (item 28) |

## The phone in more detail

- **A passcode turns on the phone's own encryption.** On iOS, setting a passcode turns Data
  Protection on. On Android 10 and later the storage is always encrypted, but without a PIN it
  unlocks as soon as the phone starts. So every phone used in the park needs a passcode or PIN, with
  auto lock on. That's what protects the photos, and anyone who unlocks the phone can open the app.
- **Backups don't carry the key.** `niah.db` is in the app's Documents folder on iOS, which goes
  into iCloud and computer backups, but that's the encrypted file now. The key is saved with
  `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, so it stays on that phone. A phone restored from a backup
  can't open the records, and the app says so instead of starting again. Anything already uploaded
  is safe on the server. Android's Auto Backup is off (`android.allowBackup` in `app.json`).
- **Expo Go can't do it.** SQLCipher needs a development or store build, so real use needs one of
  those. Expo Go keeps a plain file and is only for trying things with made up data. `npm run ios`
  and `npm run android` in `mobile/` make a development build.

## Test results

Run on 16 Oct 2026 on Umer's Mac (macOS, Node 22.22.3), on `main`.

| # | What we did | What should happen | Result |
| --- | --- | --- | --- |
| 1 | SQL tests, `cd supabase/tests && npm test` | All pass, including that `record-photos` is private, only takes images up to 10 MB, and only the uploader, officers and admins can see a photo | Pass, 131 tests |
| 2 | `git check-ignore -v web/.env.local mobile/.env` | Both are ignored | Pass |
| 3 | Searched the repo for Supabase keys and our project's ID, and the whole git history for secret keys and `.env` files | Nothing found. The only `.env` files ever committed are the two `.env.example` files | Pass |
| 4 | Opened the `niah.db` from the item 9 test (Expo Go on the iOS Simulator) with `sqlite3` and no key | On `main` it opens and the made up test record can be read, because the file has no encryption of its own yet. With SQLCipher it should say "file is not a database" | Opens, as expected on `main` |

Test 4 was before SQLCipher was merged. **Fixed on 1 Nov:** in a development build `sqlite3` says
"file is not a database", see the [item 22 results](../test-results/item-22-encryption.md). The
16 Oct test count is from that day too.

## How the phone's file is encrypted

The code is in `mobile/src/db/encryption.ts`. Jason started it on `item-22-data-encryption`, and it
was merged on 1 Nov with the fixes this page used to list.

1. **The key.** 32 random bytes from `expo-crypto`, saved in `expo-secure-store` before anything
   uses them. `PRAGMA key = "x'<64 hex characters>'"` uses them as they are, because PBKDF2 would only
   slow the app down when the key is already random.
2. **A plain file from before.** `sqlcipher_export()` copies it into a new encrypted file, the rows
   of every table get counted, and only then does the copy replace it. If that's cut off, the next
   open throws away a half made copy or finishes moving a complete one.
3. **A key that doesn't fit.** The app says the records can't be unlocked and stops. It doesn't make
   a new key or delete anything. SQLite can still fold the `-wal` file into the main file when the
   connection closes, which changes the bytes but not the records.
4. **No SQLCipher at all.** Expo Go and the Jest tests stay plain. A release build refuses to open
   the records, so a build mistake can't quietly turn the encryption off.

## Not tested yet

| What | Why | Next step |
| --- | --- | --- |
| Supabase's encryption at rest | Supabase runs it, so we can only point to what they say | Nothing to test. It's on their security page (below) |
| Database backups | Nobody has picked a plan yet, and we don't touch the hosted project from Umer's Mac | Umer picks Pro or a regular `supabase db dump` kept on an encrypted drive, then checks a restore works |
| Phones used in the park | No real phones tested yet | Check each one has a passcode. On iOS, Settings, Face ID & Passcode says "Data protection is enabled" at the bottom |
| SQLCipher on Android, real phones and a release build | Umer's Mac has no Android SDK and we have no real phones yet | Repeat the [item 22 tests](../test-results/item-22-encryption.md) on each, and time saving a record |

## Sources

- [Supabase security][supabase-security], for AES-256 at rest
- [Supabase backups][supabase-backups], for what each plan gets
- [Apple Platform Security, Data Protection][apple-dp]
- [Android encryption][android-enc]
- [SQLCipher API][sqlcipher], for `PRAGMA key`, `PRAGMA rekey` and `sqlcipher_export()`
- [Expo SQLite (SDK 57)][expo-sqlite], for `useSQLCipher`
- [Expo SecureStore (SDK 57)][expo-securestore], for the Keychain settings and backups

[supabase-security]: https://supabase.com/security
[supabase-backups]: https://supabase.com/docs/guides/platform/backups
[apple-dp]: https://support.apple.com/guide/security/data-protection-overview-secf6276da8a/web
[android-enc]: https://source.android.com/docs/security/features/encryption
[sqlcipher]: https://www.zetetic.net/sqlcipher/sqlcipher-api/
[expo-sqlite]: https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/
[expo-securestore]: https://docs.expo.dev/versions/v57.0.0/sdk/securestore/
