# How the phone syncs with Supabase

Botanists record plants in the park with no signal, so every record is saved on the phone first
(item 9) and goes up to Supabase later. Item 3 set up the server side of that and the rules the
phone follows when it uploads. Item 10 (Sprint #2) adds the "Sync now" button and the Supabase
client on the phone that use them, and item 11 adds the photos. This page is the plan they build
on.

| Part | Where |
| --- | --- |
| What the server does with an upload | [`supabase/005_phone_sync.sql`](../supabase/005_phone_sync.sql) |
| Turning a record into the row the server takes, and reading the answer | [`mobile/src/sync/upload-row.ts`](../mobile/src/sync/upload-row.ts) |
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
4. The phone reads the answer with `classifyUpload`:

| The server says | Code | What the phone does |
| --- | --- | --- |
| Nothing wrong | none | Marks the record synced |
| The ID is already there (`records_pkey`) | `23505` | Marks it synced too. It went up on an earlier try, but the answer never got back to the phone |
| A different record has the same tag code (`records_tag_code_key`) | `23505` | Keeps it on the phone and shows the tag clash message (see Known limits) |
| Not allowed: the account isn't field staff, or nobody is signed in | `42501` | Keeps it as waiting and says to ask an admin for the botanist role. Item 10 should stop the sync here, since every other record would get the same answer |
| A value breaks one of the table's rules | other `22` and `23` codes | Keeps it on the phone and says to ask an officer to check it |
| Anything else: no signal, a server error, an expired sign in, or the server not having 005 yet | anything else | Keeps it as waiting and tries again on the next sync |

`supabase/tests/sync.test.js` checks the database really sends these codes, and
`mobile/src/sync/__tests__/upload-row.test.ts` checks the phone sorts them the right way.

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
  link, so `photo_urls` from 001 isn't used for them. The website can show them to officers with
  a signed link that runs out after a while.
- Nobody can replace or delete a photo yet. If a photo upload runs twice, Storage says the file is
  already there, and item 11 should count that as done, the same way the phone does with records.
  Don't switch on `upsert`, because that needs the right to replace files.

## Known limits

- If an officer deletes a record before the phone has marked it synced, the next sync uploads it
  again. It's unlikely, because the phone marks it as soon as the answer comes back.
- Tag codes have 6 characters, so there are about 16 million of them. A clash is rare, but it
  gets likely once there are a few thousand records. The phone already picks a new ID when a new
  record's tag clashes with one on the same phone, and the server catches a clash between two
  phones. The record then stays on the phone. Item 10 can give it a new ID as long as its tag
  hasn't been printed yet, and item 12 has to check for clashes before printing a tag.
- The phone can't edit a record yet, so nothing goes up after the first upload. Editing would
  need its own plan, because an officer might have reviewed the record by then.
- The phone's species list only changes when the app is updated, until item 10 downloads it when
  the phone syncs.

## Setting it up

The SQL files have to be run in order in the Supabase SQL editor. See
[`supabase/README.md`](../supabase/README.md) for the order, where the hosted project is up to and
how to run the tests.
