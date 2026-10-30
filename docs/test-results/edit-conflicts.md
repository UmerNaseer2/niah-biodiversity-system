# Two people editing at once: test results

Round 1 was on 29 Oct 2026 on Umer's Mac (macOS, Node 22.22.3) on the `edit-conflicts` branch.
The pages were tried against the Supabase stand-in in `supabase/tests/stand-in.js` (see
`web/README.md`), signed in as the stand-in's test officer, not against the hosted project.

## What changed

Item 17's known limits said that if two people edited the same record, the last save won, and
the species forms worked the same way. So if Aina opened a record, then Ben opened it, changed
the notes and saved, and then Aina saved, Ben's notes were gone and nobody was told.

Records (from 008) and species both have an `updated_at` that a trigger moves on every change.
Now the edit pages put the `updated_at` they loaded in a hidden `version` field. When the form
is saved, the update only goes through if `updated_at` is still the same, so Aina's save above is
refused with:

> Someone else saved changes to this record after you opened it, so yours weren’t saved. Copy
> anything you need, reload the page to see their changes, then make yours again.

What Aina typed stays in the form so they can copy it. The form keeps checking against the old
version until the page is reloaded, so pressing Save again doesn't get round it. After a save
that works, the form moves on to the new version, so saving twice in a row still works.

The code is in `web/src/lib/edit-version.ts`, and `editRecord` and `editSpecies` use it.

**Species photos.** Adding, removing or changing a photo on the edit species page also moves
`updated_at`. The page comes back with the new version, and the details form moves on to it as
long as the details are still the ones it loaded. So changing your own photo and then saving the
details works, but if someone else changed the details in between, it's still refused.

**Without JavaScript.** The form posts the same hidden field, and the page that comes back still
has the old version in it, so it behaves the same way.

## Automated checks

| Check | Command | Result |
| --- | --- | --- |
| Website lint | `cd web && npm run lint` | Pass |
| Types | `cd web && npx tsc --noEmit` | Pass |
| Build | `cd web && npm run build` | Pass |

## Manual tests (stand-in)

Two tabs on the same page, called A and B below. "No JavaScript" means the form's fields were
read from the page the server sent and posted to the page's address, which is what a browser
does with JavaScript turned off.

### Edit a record

| # | What we did | What should happen | Pass? |
| --- | --- | --- | --- |
| 1 | Opened the stand-in tree in A and B. Changed the notes in B and saved, then changed the notes in A and saved | B saves. A is refused with the message above, A's typing stays, and focus moves to the error box | Pass |
| 2 | Reloaded A | A shows B's notes and saves normally after that | Pass |
| 3 | Saved, pressed Keep editing and saved again | Both save, because the form moved on to the new version | Pass |
| 4 | No JavaScript: posted with the version from before B's save | Refused, the typed value comes back in the form with the old version, and the database doesn't change | Pass |
| 5 | No JavaScript: posted with the current version, twice | Both save | Pass |
| 6 | Posted with no version at all | Saves, so a page loaded before this change still works | Pass |
| 7 | Posted for a record id that doesn't exist | "This record isn’t in the database any more" rather than the conflict message | Pass |

### Edit a species

| # | What we did | What should happen | Pass? |
| --- | --- | --- | --- |
| 1 | Opened Tapang in A and B. Typed a new summary in A without saving, then changed the photo credit in A | The credit saves, the typed summary stays, and saving the details after that says "Changes saved" | Pass |
| 2 | In B (opened before A's changes), typed a summary and changed the photo credit back | The credit saves, but the details form keeps its old version because A changed the details | Pass |
| 3 | Saved the details in B | Refused with the species version of the message, and B's summary stays | Pass |
| 4 | No JavaScript: posted the details with the version B opened with | Refused, the typed summary comes back, and the database doesn't change | Pass |

The stand-in records and Tapang were put back the way they were after testing.

## Known limits

- **Two saves in the same millisecond.** The check matches any `updated_at` in the same
  millisecond as the one the form loaded, because the stand-in only keeps milliseconds. Two
  people would have to save within a thousandth of a second of each other for one to be missed.
- **It doesn't merge.** If two people change different boxes, the second one still has to reload
  and type theirs again. That's simpler and safer than guessing which box each person meant.
- **Deleting isn't checked.** Someone can delete a record or species another person is editing.
  Their save then says it isn't in the database any more, which was already the case before.

## Not tested yet

- The hosted Supabase project, which needs 003 to 009 run first. Its times have microseconds,
  which the code drops before comparing, but that hasn't been seen working there.
- A screen reader reading out the conflict message. It uses the same error box as the other
  errors on these forms.
