# Two people editing at once: test results

Round 1 was on 29 Oct 2026 on Umer's Mac (macOS, Node 22.22.3) on the `edit-conflicts` branch.
The pages were tried against the Supabase stand-in in `supabase/tests/stand-in.js` (see
`web/README.md`), signed in as the stand-in's test officer, not against the hosted project.
Round 2, on the same day on the `delete-checks-edits` branch, added the same check to the delete
pages. Round 3, on the `exact-version-times` branch, made the check exact to the microsecond when
the time has microseconds.

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

## Round 2: deleting checks too

Round 1's known limits said someone could delete a record or species another person had just
changed. Say Ben fixed a record's species name, and Aina, who opened the delete page before that,
then deleted it because the old name looked wrong. The record would be gone with Ben's fix.

Now the delete pages send back the `updated_at` they loaded in the same hidden `version` field, and
`deleteRecord` and `deleteSpecies` only delete the row if it hasn't moved since. Otherwise
nothing is deleted and the page says:

> Someone else saved changes to this record after you opened this page, so it wasn’t deleted.
> Reload the page to see what changed, then delete it again if you still want to.

The tests used a throwaway record and species added through the stand-in's API, so the sample
data wasn't touched. "Someone else" was the stand-in's test admin saving a change through the API.

| # | What we did | What should happen | Pass? |
| --- | --- | --- | --- |
| 1 | No JavaScript: loaded the record's delete page, someone else saved a change, then posted the delete | Refused with the message above, and the record is still there | Pass |
| 2 | No JavaScript: loaded the page again and posted the delete | Deleted, and the page goes to the records list | Pass |
| 3 | No JavaScript: the same two steps for a species | Refused the first time with the species message, deleted after a reload | Pass |
| 4 | With JavaScript: opened the record's delete page, someone else saved a change, then pressed Delete record | Refused with the message, focus moves to it, and the record is still there | Pass |
| 5 | With JavaScript: reloaded and pressed Delete record | Deleted, and the records list says "Record NNP-AD466C was deleted" | Pass |
| 6 | With JavaScript: the same two steps for a species | Refused with focus on the message, then deleted after a reload | Pass |

The species list didn't show its "was deleted" line after test 6. That's because the throwaway
species' name has three words, and the line only shows for a name the add species form would
accept. A real species name shows it.

The throwaway rows were removed afterwards, and the stand-in still has its 10 records and 7
species.

## Round 3: exact to the microsecond

Hosted Supabase gives `updated_at` to the microsecond, like `10:12:33.123456`, but the check
dropped everything past the milliseconds, so any save in the same thousandth of a second counted
as the version the form loaded. `versionRange` in `web/src/lib/edit-version.ts` now keeps the
microseconds when the time has them and only matches that exact time. A time with three digits
or fewer after the point still matches the whole millisecond. That's what the stand-in gives, and
it's also what Postgres sends for a time that ends in zeros, since it leaves them off.

| Test | Result |
| --- | --- |
| Four times put through `versionRange`, the stand-in's own (`.861Z`), six digits, a time zone of +10:00, and a time with fewer digits: each gives the range expected | Pass |
| In PGlite, rows saved at `.123456`, `.123457` and `.123999` of the same second: the version of each matches only its own row. Before, all three matched each other | Pass |
| The round 2 check again on the stand-in, record and species: the old page's delete is refused and the reloaded page's delete goes through | Pass |
| `npm run lint`, `npx tsc --noEmit` and `npm run build` | Pass |

## Known limits

- **Fixed on 29 Oct:** two saves in the same millisecond could miss each other, because the
  check only looked at milliseconds. On hosted it's now exact to the microsecond (round 3). The
  stand-in only keeps milliseconds, so it still works the old way there.
- **It doesn't merge.** If two people change different boxes, the second one still has to reload
  and type theirs again. That's simpler and safer than guessing which box each person meant.
- **Fixed on 29 Oct:** deleting wasn't checked, so someone could delete a record or species right
  after another person changed it. Now the delete pages check the version too. See round 2.
- **Deleting still wins over an edit that hasn't been saved.** If Aina is still typing on the
  edit page when Ben deletes the record, Aina's save says it isn't in the database any more.
  There's nothing to compare until a save happens.

## Not tested yet

- The hosted Supabase project, which needs 003 to 009 run first. Its times have microseconds,
  which the code now compares exactly (round 3), but that hasn't been seen working there.
- A screen reader reading out the conflict message. It uses the same error box as the other
  errors on these forms.
