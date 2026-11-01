# How the phone syncs with Supabase

Botanists record plants in the park with no signal, so every record is saved on the phone first
(item 9) and goes up to Supabase later. Item 3 set up the server side of that and the rules the
phone follows when it uploads. Item 10 (Sprint #2) added sign in, the "Sync now" button and the
part that decides when to sync, and item 11 added the photos. This page says how it all works.

| Part | Where |
| --- | --- |
| What the server does with an upload | [`supabase/005_phone_sync.sql`](../supabase/005_phone_sync.sql) |
| Turning down a record an officer deleted | [`supabase/010_deleted_records.sql`](../supabase/010_deleted_records.sql) |
| Turning a record into the row the server takes, and reading the answer | [`mobile/src/sync/upload-row.ts`](../mobile/src/sync/upload-row.ts) |
| One sync from start to finish | [`mobile/src/sync/sync-engine.ts`](../mobile/src/sync/sync-engine.ts) |
| The calls to Supabase | [`mobile/src/sync/supabase-api.ts`](../mobile/src/sync/supabase-api.ts) |
| When the phone syncs | [`mobile/src/state/sync-context.tsx`](../mobile/src/state/sync-context.tsx) |
| Who's signed in, and keeping the session | [`mobile/src/state/account-context.tsx`](../mobile/src/state/account-context.tsx), [`mobile/src/lib/chunked-storage.ts`](../mobile/src/lib/chunked-storage.ts) |
| Tests for what the phone reads back | [`supabase/tests/phone-reads.test.js`](../supabase/tests/phone-reads.test.js) |
| Tests that run our SQL and act as each kind of user | [`supabase/tests/`](../supabase/tests/) |
| Example records both sides test against | [`supabase/tests/fixtures/phone-upload.json`](../supabase/tests/fixtures/phone-upload.json) |

## Uploading a record

1. The phone gives the record an ID (a v4 UUID) the moment it's saved, so the record and its tag
   code work with no signal. The tag code is `NNP-` plus the first 6 characters of the ID.
2. When there's signal and someone is signed in as a botanist, officer or admin, the phone sends
   each waiting record on its own, as an insert into `records`. `toUploadRow` builds the row:
   `id`, `species_name`, `species_slug`, `common_name`, `height_m`, `condition`, `notes`, `gps`,
   `photo_count` and `recorded_at`. Anything empty goes as `null`, so nothing falls back to a
   server default by accident. The location goes as `{ lat, lng, accuracyM, capturedAt }`.
3. The server then:
   - works out `tag_code` from the ID, the same way the phone does
   - fills in `submitted_by` (the signed in user) and `recorded_by` (their name from
     `profiles`), whatever the phone sent
   - clears a `species_slug` the species table doesn't have, because the phone's species list
     can have species the server doesn't have yet. `species_name` always goes up, so nothing is
     lost
   - starts the record as `waiting`, so it stays off the public website until an officer
     publishes it
   - turns down a value that breaks a rule, like a height of 0 or a latitude past 90
   - turns down a record an officer has deleted on the website (since 010)
4. The phone reads the answer with `classifyUpload`:

| The server says | Code | What the phone does |
| --- | --- | --- |
| Nothing wrong | none | Marks the record synced |
| The ID is already there (`records_pkey`) | `23505` | Marks it synced too. It went up on an earlier try, but the answer never got back to the phone |
| An officer deleted the record on the website (`deleted_records_pkey`, since 010) | `23505` | Keeps it on the phone and says an officer deleted it, so it won't go up again |
| A different record has the same tag code (`records_tag_code_key`) | `23505` | Keeps it on the phone and shows the tag clash message (see Known limits) |
| Not allowed: the account isn't field staff | `42501` | Keeps it as waiting, says to ask an admin for the botanist role and stops the sync, since every other record would get the same answer |
| A value breaks one of the table's rules | other `22` and `23` codes | Keeps it on the phone and says to ask an officer to check it |
| No signal, or a session the server won't take (codes starting `PGRST30`) | none, or `PGRST30x` | Keeps it as waiting and stops the sync, since the rest would go the same way |
| Anything else: a server error, or the server not having 005 yet | anything else | Keeps it as waiting, carries on with the next record and tries again on the next sync |

`supabase/tests/sync.test.js` checks the database really sends these codes, and
`mobile/src/sync/__tests__/upload-row.test.ts` checks the phone sorts them the right way.

## When the phone syncs

Nobody has to remember to press anything. The proposal's target is that records go up within 5
minutes of signal coming back, and with no duplicates. While someone is signed in and the app is
open, it syncs:

- when they sign in, and when the app opens with someone already signed in
- when the app comes back to the front
- when the phone says it has a connection again
- when a new record is saved
- every 60 seconds while a record is waiting, because a phone can look connected with no real
  signal, and can lose and get back signal without saying so
- when someone presses Sync now, which also tries records that had a problem

With nothing waiting, the automatic ones skip the sync if the last one finished in the past 5
minutes, since all it would do is download things again. One sync runs at a time. If something
turns up during a sync, another one runs after it.

One sync (`runSync`) goes like this:

1. Upload the waiting records one at a time. Before each one it checks there's a usable session,
   because `supabase.from()` falls back to the anon key when there isn't one, and the answer to that
   looks like an account that isn't allowed to upload. It would be wrong to tell someone their role
   is the problem when their sign in just ran out.
2. Stop early if there's no signal, the session is refused or the account isn't allowed. The
   records stay as they are, and nothing is marked as a problem because of it.
3. Read back what officers decided about the records this phone has uploaded (`status` and
   `review_notes`, 100 IDs at a time). A botanist can read their own since 006, and
   `phone-reads.test.js` checks that. The list shows "Approved" or "Rejected", and a rejected record
   shows the officer's reason. A record that isn't there any more just stays as it was.
4. Download the species list from `species_public`, 500 at a time. The phone then uses that list
   for suggestions, and goes on using it with no signal. A download that comes back empty or fails
   leaves the old list alone.
5. Save when the sync finished, for "Last synced" on the Profile tab. A failed download in steps 3
   or 4 doesn't lose any records, but it doesn't count as a whole sync either.

## Signing in

The proposal says a botanist logs in once while they have signal and can still open the app in the
forest. Three things make that work:

- **The session is kept in the phone's keychain** with `expo-secure-store`, set so it only opens
  on this phone once the phone has been unlocked since it started. Some phones turn down values over
  about 2 KB, and a session can be bigger than that, so `chunked-storage.ts` splits it into parts
  and only switches to the new parts once they've all saved.
- **Being signed in doesn't depend on reaching the server.** With an expired token and no signal
  Supabase says there's no session, and can take half a minute to say it. So the app also keeps who's
  signed in, and the screens go by that. The server still checks every request, so this only
  decides what the app shows.
- **Only the server can end a sign in.** If the token can't be refreshed because there's no signal,
  nothing changes and it's tried again later. If the server says the session is no longer any good,
  the app signs out and says "Your sign in ended, so sign in again to sync. Your records are safe
  on this phone." Records are never removed when someone signs out.

Signing out works with no signal too. It removes the session from the phone, and the token that's
already out there runs out on its own within the hour.

## Why it works this way

**IDs come from the phone.** The phone can't ask the server for an ID with no signal. A v4 UUID
has 122 random bits, so two phones won't come up with the same one.

**The phone only ever inserts, and a record that's already there counts as uploaded.** The
proposal said an upload that runs twice would update the row that's already there. We changed
that for two reasons:

- An update could write the phone's old copy over a record an officer has already reviewed or
  published.
- An upsert through the API needs the right to update and read `records` as well. Since 006
  (item 4) a botanist can only read their own records, and only edit one while it waits for
  review, so an upsert would fail once an officer had reviewed the record. An insert only needs
  the right to add records.

So if the answer to an upload gets lost (the signal drops just after it went up), the next sync
sends the same record again, the server says the ID is taken, and the phone marks it synced. The
same record has the same tag code too, so both rules are broken at once, but the server always
names `records_pkey`. That's because 005 makes the tag code rule `DEFERRABLE`, so Postgres checks
it at the end of the insert, after the ID. Otherwise Postgres would check the rule that was made
first, and the answer could change if someone rebuilt the primary key. The phone relies on this,
and the tests check it, even with the primary key rebuilt.

**A deleted record stays deleted.** Since 010 the server keeps the ID of every record an officer
deletes, with who deleted it and when, in `deleted_records`. Nothing else about the record is
kept. An upload with one of those IDs gets the same kind of answer as an ID that's taken, but
naming `deleted_records_pkey`, so the phone can tell the two apart. Without this, a phone that
hadn't heard back about a record would send it again after the delete and it would come back.
Someone in the SQL editor can still put a deleted record back on purpose, and then the ID comes
off the list, so the phone is told it's synced.

**One record per request.** If 20 records went up in one request and one of them was bad,
Postgres would turn down all 20. One at a time, a bad record can't hold back the rest, and every
answer is about one record.

**The server works out the tag code.** It's made from the ID the same way as `tagCodeFor()` on
the phone, so the two can't disagree, and the server won't take two records with the same code.

**The server fills in who and when.** A signed in user can only fill in the columns in step 2.
Sending `status`, `recorded_by`, `submitted_by`, `uploaded_at`, `photo_urls` or a review column
gets "permission denied", so a botanist can't publish their own record or upload one in someone
else's name. An account without the botanist, officer or admin role can't upload at all, because
Row Level Security turns it down. Who uploaded it and when it got to the server go in
`submitted_by` and `uploaded_at`, next to the phone's own `recorded_at`.

**A record doesn't need a species from the species table.** `species_slug` is optional now, and a
botanist can type in a name that isn't on the list (like *Ficus sp.*). Deleting a species keeps
its records and only clears their slug, where before it deleted every record of that species.

**Height is optional.** 001 saved a missing height as 0, which isn't a real height. 005 makes it
empty instead, for the old records too, and turns down 0 or less.

## Photos (item 11)

005 makes a Storage bucket called `record-photos` for them:

- It's private, because a photo can show where a plant is. The older `botanical-photos` bucket
  from 001 is public, so record photos must never go in there.
- It takes JPEG, PNG, WebP and HEIC files up to 10 MB.
- A photo goes in a folder named after the uploader's user ID, like
  `<user id>/<record id>/1.jpg`. Field staff can only upload into their own folder.
- Only the uploader, officers and admins can see a photo. A private photo has no fixed public
  link, so `photo_urls` from 001 isn't used for them. The website shows them to officers and
  admins on the record edit page with signed links that run out after an hour (item 18).
- Nobody can replace a photo. If a photo upload runs twice, Storage says the file is already
  there, and the phone counts that as done, the same way it does with records. Don't switch on
  `upsert`, because that needs the right to replace files.
- Since 009, officers and admins can delete record photos, and the website deletes a record's
  photos when it deletes the record (item 18). Field staff still can't delete their own.

How the phone sends them (see the [test results](test-results/item-11-photos.md)):

- **Photos go after every record in a sync**, as the proposal says, so a photo never gets there
  before its record. A record that hasn't gone up keeps its photos back with it.
- **Only the account that sent the record sends its photos.** `records.photo_folder` stays set to
  whoever sent the record (014), and that's where the website looks. So the phone keeps that account
  in `plant_records.uploaded_by` and leaves the photos waiting while anyone else is signed in.
- **Each answer has one meaning.** Uploaded or already there counts as done. A session the server
  refuses, or no signal, stops the sync and nothing changes. An account that isn't
  allowed stops it too. A file that's gone from the phone, or a photo the server turned down, gets
  marked on the photo and shows on the record. An automatic sync skips those, and Sync now tries
  them again. Anything else goes again next time.
- **The phone sends raw bytes, not a form**, and never asks to replace a file.
- **Before any of this, the phone saves its own smaller JPEG** with the longest side at 2048 pixels
  and quality 0.7. Writing it again from the pixels takes the GPS block out, even on a small photo.
  Only the sizes and the orientation stay in the file. Some of these plants are protected, so the
  picker's own copy gets deleted as well.
- **Photos stay on the phone after they've gone up**, so thumbnails work with no signal.

## Known limits

- **Fixed on 29 Oct:** if an officer deleted a record before the phone had marked it synced, the
  next sync uploaded it again. Since 010 the server turns it down and the phone says an officer
  deleted it (see "A deleted record stays deleted" above). Since 30 Oct the record's page on the
  phone has a button to remove it from the phone.
- A record with the `deleted` problem can still be picked up by a sync, since the phone tries
  every waiting record again. If someone removes it while that request is on its way, the answer
  has nothing left to mark, so `saveUploadOutcome` does nothing with it and the sync carries on,
  and it isn't counted as a failure.
- Tag codes have 6 characters, so there are about 16 million of them. A clash is rare, but it
  gets likely once there are a few thousand records. The phone already picks a new ID when a new
  record's tag clashes with one on the same phone, and the server catches a clash between two
  phones. The record then stays on the phone, and its page has a "Get a new tag" button that gives
  it a new ID and tag code. It warns that a tag already on the plant has to be swapped.
- The phone can't edit a record yet, so nothing goes up after the first upload. Editing would
  need its own plan, because an officer might have reviewed the record by then.
- The phone only syncs while the app is open. There's no background sync, so someone who never
  opens the app with signal never uploads. The proposal doesn't ask for more than this.
- A record goes up in the name of whoever is signed in when it syncs, not whoever saved it, because
  the server fills that in from the session (005). Signing out warns about this when records are
  waiting.
- A record an officer deleted after it uploaded stays on the phone as synced, since the phone can't
  tell "deleted" from "you aren't allowed to see this" when it reads back.
- Pressing Sync now tries rejected records again as well, in case the reason has been sorted out.
  They normally get the same answer.
- On iOS the keychain outlives the app, so someone who deletes and reinstalls the app can come back
  signed in if the session is still good.
- Signing out with no signal can't tell the server, so that token works until it runs out.

## Setting it up

The SQL files have to be run in order in the Supabase SQL editor. See
[`supabase/README.md`](../supabase/README.md) for the order, where the hosted project is up to and
how to run the tests.
