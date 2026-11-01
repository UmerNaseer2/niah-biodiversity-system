# Item 22: encryption at rest

How the system's data is protected while it's stored. Jason is adding SQLCipher to the phone app
on the `item-22-data-encryption` branch, so the records file on each phone gets its own encryption
on top of the phone's. This page says where each copy of the data lives on `main`, what protects it
now, and what that branch still needs before it's merged.

Status on 16 Oct 2026: in progress. Supabase and the phones' own encryption cover the data for
now, and the phone's records file gets its own encryption once the SQLCipher branch is merged.

## Where the data is stored

| Where | What's there | How it's protected | Status |
| --- | --- | --- | --- |
| Supabase database | Species, profiles, sensor nodes, and records with their exact GPS points | Supabase encrypts all customer data at rest with AES-256. Row Level Security then decides who can read each row (item 4) | Done by Supabase |
| Supabase Storage | `record-photos` from the phone (005) and `botanical-photos` for the plant pages (001 and 006) | The same AES-256 at rest. `record-photos` is private, because a photo can show where a plant is, so only the uploader, officers and admins can open one | Done (our SQL, tested below) |
| Database backups | A full copy, exact GPS points included | Supabase makes daily backups on the Pro plan and up (Pro keeps 7 days). On the free plan it asks you to export the data yourself with `supabase db dump`. A dump has every exact point, so it goes on an encrypted drive, never in the repo or a shared folder | Not decided yet |
| The phone's database (`niah.db`) | Records saved offline, with exact GPS points | It's in the app's own folder, which other apps can't read. iOS Data Protection and Android's file based encryption encrypt it, as long as the phone has a passcode. The file isn't encrypted on top of that yet | Partly done |
| The phone's photos (item 11) | Record photos waiting to upload, and the ones already sent, with the GPS block taken out | Plain JPEG files in the app's own folder, so the same iOS and Android protection as `niah.db` and nothing on top. SQLCipher wouldn't cover these, because they aren't in the database | Partly done |
| The phone's sign in (item 10) | The Supabase session | `expo-secure-store`, which uses the iOS Keychain and the Android Keystore. Never SQLite or a plain file | Done on the simulator (item 10) |
| The website | Nothing. Pages read Supabase on every visit, and a signed in officer's browser only holds the Supabase sign in cookie | Nothing stored on our side to encrypt | Nothing to do |
| The repo | Code and made up data. The repo is public | No keys or passwords in it. `.env` files are gitignored, and only the `.env.example` files are committed | Done (tested below) |
| ESP32 sensor nodes (item 28) | The WiFi password and the device's own credentials | Kept in `secrets.h`, which is gitignored, with a `secrets.example.h` committed instead | Done in the code, not on real hardware (item 28) |

## The phone in more detail

- **A passcode is what turns it on.** On iOS, setting a passcode turns Data Protection on. On
  Android 10 and later the storage is always encrypted, but without a PIN it unlocks as soon as
  the phone starts. So every phone used in the park needs a passcode or PIN, with auto lock on.
- **Backups copy the file.** `niah.db` is in the app's Documents folder on iOS, which goes into
  iCloud and computer backups. Android's Auto Backup copies app files too, and Expo leaves
  `allowBackup` on unless `app.json` turns it off. A computer backup without "Encrypt local
  backup" ticked keeps the records in plain form on that computer. Once item 10 uploads the
  records, the phone's copy doesn't need backing up, so turn `android.allowBackup` off along with
  SQLCipher. Expo's docs say Auto Backup has to leave out `expo-secure-store` values anyway,
  because they can't be decrypted after a restore.
- **Expo Go can't do it.** SQLCipher needs a development build (`npx expo prebuild`), and the team
  tests in Expo Go at the moment. Moving to development builds is a team decision for Sprint 2.

## Test results

Run on 16 Oct 2026 on Umer's Mac (macOS, Node 22.22.3), on `main`.

| # | What we did | What should happen | Result |
| --- | --- | --- | --- |
| 1 | SQL tests, `cd supabase/tests && npm test` | All pass, including that `record-photos` is private, only takes images up to 10 MB, and only the uploader, officers and admins can see a photo | Pass, 131 tests |
| 2 | `git check-ignore -v web/.env.local mobile/.env` | Both are ignored | Pass |
| 3 | Searched the repo for Supabase keys and our project's ID, and the whole git history for secret keys and `.env` files | Nothing found. The only `.env` files ever committed are the two `.env.example` files | Pass |
| 4 | Opened the `niah.db` from the item 9 test (Expo Go on the iOS Simulator) with `sqlite3` and no key | On `main` it opens and the made up test record can be read, because the file has no encryption of its own yet. With SQLCipher it should say "file is not a database" | Opens, as expected on `main` |

## What the SQLCipher branch still needs

`item-22-data-encryption` (Jason) makes a random 32 byte key, keeps it in `expo-secure-store` and
unlocks `niah.db` with it before the migrations run. That's the right idea. Checked against `main`
on 16 Oct, it needs these before it's merged:

1. **Add `expo-secure-store`.** It isn't in `package.json`, so `npx tsc --noEmit` fails (TS2307)
   and both database test files fail with "Cannot find module". Add it with
   `npx expo install expo-secure-store`.
2. **Turn SQLCipher on in the build.** Add `"useSQLCipher": true` to the `expo-sqlite` plugin in
   `app.json`. It only works in a development build. The branch stops with an error when SQLCipher
   is missing, so in Expo Go the app can't open any records at all.
3. **Encrypt phones that already have records.** `PRAGMA rekey` only changes the key of a file
   that's already encrypted. SQLCipher's docs say to copy a plain file into a new encrypted one
   with `sqlcipher_export()`, then swap them. Without that, a phone with records from Sprint 1
   keeps a plain file, and could fail to open it on the next start.
4. **Keep the Jest tests running.** `jest/expo-sqlite.js` uses sql.js, which has no SQLCipher, so
   the tests need the unlock step skipped or mocked.
5. **Use the key as raw bytes.** `PRAGMA key = "x'<64 hex characters>'"` uses the 32 bytes as
   they are. Passing the hex as a passphrase makes SQLCipher run PBKDF2 every time the app opens,
   which only slows it down, because the key is already random.
6. **Pick the Keychain setting.** The default, `WHEN_UNLOCKED`, means the database can't open
   while the phone is locked, which matters if item 10 syncs in the background.
   `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` allows that and keeps the key on that one phone.
7. **Test it on real phones.** Open the file with `sqlite3` and check it says "file is not a
   database", check an update from a Sprint 1 install keeps its records, and check the app still
   opens its records after a restart.

## Not tested yet

| What | Why | Next step |
| --- | --- | --- |
| Supabase's encryption at rest | Supabase runs it, so we can only point to what they say | Nothing to test. It's on their security page (below) |
| Database backups | Nobody has picked a plan yet, and we don't touch the hosted project from Umer's Mac | Umer picks Pro or a regular `supabase db dump` kept on an encrypted drive, then checks a restore works |
| Phones used in the park | No real phones tested yet | Check each one has a passcode. On iOS, Settings, Face ID & Passcode says "Data protection is enabled" at the bottom |
| SQLCipher | The branch isn't merged | Run step 7 above on a development build |

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
