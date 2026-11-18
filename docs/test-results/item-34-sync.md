# Item 34 test results: phone to website sync

Item 34 is checking that what's recorded on the phone gets to the website, and what staff decide on the
website gets back to the phone. [Item 10](item-10-sync.md) tested the sync code and
[item 43](item-43-integration.md) followed one record from the phone to the public tag page. This adds
the cases those didn't cover.

The first part ran on 18 Nov 2026 (19 Nov in park time) on Umer's Mac against the Supabase stand-in. The second part is a
checklist for a real phone against hosted Supabase, which only Umer can run. **Item 34 stays open
until that's done.**

## Part 1: on the stand-in

The phone was Expo Go on an iPhone 17 Pro simulator, signed in as the stand-in conservation officer,
with its location set to a spot near the park HQ. The website ran locally, signed in as the stand-in
admin. Both talked to the same stand-in (`supabase/tests/stand-in.js`).

| # | What we did | What happened | Pass? |
| --- | --- | --- | --- |
| 1 | Signed in on the phone with 3 records saved and not yet sent (one with 1 photo, one with 2) | The first sync sent all 3 records and all 3 photos without anyone pressing anything. Each record went to "Synced" | Yes |
| 2 | Pressed Sync now again with nothing new | "Nothing new to upload." | Yes |
| 3 | Opened Review on the website | All 3 were in the queue as "Recorded by Aina Officer", with GPS accuracy, photo count and the checks | Yes |
| 4 | Opened the record with 2 photos on the website and asked the stand-in for its photo links | Both links gave back the real JPEG files (about 1.1 MB each) | Yes |
| 5 | Rejected NNP-C8F349 with the reason "Wrong species..." | It moved to Recently reviewed with the reason | Yes |
| 6 | Pressed Sync now on the phone | The list showed "Rejected". Opening the record showed "Rejected by an officer" with the same reason, word for word | Yes |
| 7 | On the website, pressed "Back to the queue" on NNP-C8F349, then Sync now on the phone | The phone stopped showing it as rejected and went back to "Synced" | Yes |
| 8 | On the phone, opened NNP-1C83DD and pressed "Add a visit", condition Damaged, with a note | The form said which plant it was a visit to. The visit saved, synced by itself, and the record's History listed the visit and the first record | Yes |
| 9 | Opened Review on the website | The visit showed as "Visit to NNP-1C83DD" with the condition and the note | Yes |
| 10 | Approved NNP-1C83DD and the visit, then Sync now on the phone | The phone showed the visit as "Approved" | Yes |
| 11 | Opened the public tag page for NNP-1C83DD, signed out | It showed "First recorded" and "Later visits" (1 visit, Damaged). The exact spot was hidden because the species is protected | Yes |
| 12 | Opened the QR code for a protected record and a threatened record on the phone | Both tags hold only the code, and the phone says why | Yes |
| 13 | Added Dryobalanops beccarii (Kapur bukit) on the website, then Sync now on the phone | Typing "Dryo" in a new record showed the new species to pick | Yes |

Things we noticed that aren't bugs:

- Development builds add 3 sample records to the list so a new phone isn't empty. They're never saved,
  so they never upload, but the "waiting to sync" banner and the tab badge count them. A real build
  doesn't have them. The sign out warning only counts saved records, so it isn't affected.
- One photo showed as "couldn't upload" because its file had been deleted on the simulator in an
  earlier run. The record page says so, which is what it's meant to do.
- The built-in browser in the Claude app couldn't show the photos because it can't reach the
  stand-in's port, so we checked the photo links directly instead (row 4).

Not covered here, so it's in Part 2: the sign out warning with a record that really is waiting, and
flight mode on a real phone. Stopping the stand-in to fake no signal would have wiped its data.

## Part 2: on a real phone against hosted (about 10 minutes)

Before this, hosted needs the SQL files up to the latest one and the website deployed
([hosted-setup.md](../hosted-setup.md)). Use a test plant name and a spot that isn't a real plant.
Tick each row and write down anything that doesn't match.

You need the phone with Expo Go, signed in as a conservation officer, and a laptop signed in to the
website as an admin.

| # | Do this | You should see | Pass? |
| --- | --- | --- | --- |
| 1 | On the phone, new record, a common species, one photo, capture location, save | The record shows "Synced" within a few seconds | |
| 2 | On the website, open Review | The record is there with its photo, GPS accuracy and species | |
| 3 | Reject it with a reason, for example "Wrong species, please check" | It moves to Recently reviewed | |
| 4 | On the phone, My Records, press Sync now, then open the record | The list shows "Rejected", and the record shows "Rejected by an officer" with the same reason | |
| 5 | On the website, open the record from Recently reviewed, fix the species, then press "Back to the queue" | It's back in the queue with its photo | |
| 6 | On the phone, press Sync now | The record shows "Synced" again, not "Rejected" | |
| 7 | Approve it | It shows on the public tag page, signed out, without the exact spot if the species is hidden | |
| 8 | Turn on flight mode, save a second record | It saves straight away and shows as waiting | |
| 9 | Turn flight mode off and open the app | The second record syncs by itself within a minute | |
| 10 | On the website, add a new species to the species list | It saves and gets its own page on the public site | |
| 11 | On the phone, press Sync now or restart the app | The new species can be picked in a new record | |
| 12 | Put the phone in flight mode, save a third record, then sign out | The app warns "1 record is still waiting. It stays on this phone, and it'll upload under whoever signs in next." | |

Afterwards, delete the test records on the website so they don't show to the public.

| Run by | Date | Phone | Result |
| --- | --- | --- | --- |
| | | | |
