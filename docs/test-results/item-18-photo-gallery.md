# Item 18 test results: botanical photograph upload and gallery (web)

Round 1 was on 29 Oct 2026 on Umer's Mac (Node 22) on the `item-18-photo-gallery` branch. The
hosted Supabase project doesn't have the SQL files after 002 yet, so the pages were tried against
the Supabase stand-in in `supabase/tests/stand-in.js` (see `web/README.md`). It builds the same
database as the SQL tests and now does the parts of Storage the website uses, so the Storage
policies from our SQL files decide who can upload, list and delete.

## What it does

- **Photos on the species edit page** (`/dashboard/species/[slug]/edit`, under the form): officers
  and admins upload a photo with a caption and who took it, change the caption and credit later,
  pick the main photo and remove photos. A species can have up to 12. Each change saves straight
  away.
- **Uploads are cleaned up on the server.** The website takes JPEG, PNG and WebP files up to 4 MB,
  checked in the browser and again on the server. `sharp` turns the photo the right way up, makes
  it a JPEG up to 1600 pixels across and leaves out the EXIF data, so a location the phone saved in
  the file never reaches the public bucket. Anything sharp can't open as one of those three types,
  like an SVG or a text file renamed to `.jpg`, is turned down.
- **Public pages** show the photos: a gallery on each plant page (main photo big, the rest under
  it), the main photo in the plant list and on tag pages.
  Captions are the alt text, and each photo opens the full size file.
- **Field photos on the record edit page** (`/dashboard/records/[id]/edit`): the photos a phone
  uploaded with the record, from the private `record-photos` bucket, with signed links that last
  an hour. Only officers and admins see them. They never go on the public site.
- **Deleting** a species deletes its uploaded photo files, and deleting a record deletes its field
  photos.
- **`supabase/009_species_photos.sql`**: checks what goes in `species.photos` (an outside link or a
  file in that species' own folder, a caption and a credit, at most one main photo, at most 12),
  adds `species_photos_public` so the public pages can read the photos, and lets officers and
  admins delete files in `record-photos`.

## Decisions

| Question | Decision | Why |
| --- | --- | --- |
| Where species photos go | The public `botanical-photos` bucket from 001, in `species/<species id>/<random id>.jpg` | The bucket and its upload rules (006) were already there. A new name every time means an upload never replaces another photo |
| Location data in photos | Taken out on the server before the upload | The bucket is public, and Storage policies can't look inside a file (the item 4 test results asked for this) |
| How photos are stored | Still the `photos` list on `species`, now checked by 009 | Nothing else had to change, and the sample species already use it |
| Two officers changing photos at once | The save only goes through if the list is still the one the page started from | Otherwise one person's change could quietly undo the other's. The second person is told to reload |
| Photos in species_public | A view of their own, `species_photos_public` | Adding a column to `species_public` would make running 007 again fail. Without 009 the pages still work and show no photos |
| Record photos on the website | Officers and admins only, with signed links | A field photo can show where a plant grows. The phone doesn't upload photos yet (item 11), so this is ready for when it does |

## Automated checks

| Check | Command | Result |
| --- | --- | --- |
| Database tests | `cd supabase/tests && npm test` | Pass, 164 of 164. `photos.test.js` (20 tests) checks 009: the sample species still pass, links and uploaded photos both work, lists the website would never save are turned down (a path in another species' folder, two main photos, 13 photos, a missing caption and more), only officers and admins change photos, a save from a list that changed first does nothing, the same list with its keys in another order still saves, record photos can only be deleted by officers and admins, and running 009 again changes nothing. `stand-in.test.js` checks the new Storage parts of the stand-in |
| Website lint | `cd web && npm run lint` | Pass |
| Types | `cd web && npx tsc --noEmit` | Pass |
| Build | `cd web && npm run build` | Pass |

## Manual tests (stand-in, signed in as the test officer)

| Test | Result |
| --- | --- |
| Upload with nothing filled in shows a summary of 3 problems and moves focus to it | Pass |
| A text file renamed to `.jpg` is turned down by the server with "This file couldn’t be opened as a photo", and the caption stays filled in | Pass |
| A 2400 by 1800 JPEG with a GPS location in its EXIF data, with "Make it the main photo" ticked, says "Photo added." and becomes the main photo. The form empties | Pass |
| The stored file is 1600 by 1200 and has no EXIF data at all | Pass |
| The plant page gallery, the plant list and the tag page all show the new main photo | Pass |
| "Make main photo" on another photo says "Main photo changed." and the badge moves | Pass |
| Remove asks first ("Remove this photo? Its file is deleted too."), then says "Photo removed.", and the file's public link gives 404 | Pass |
| Focus goes to the question when Remove asks, back to Remove after "Keep it", and to the Photos heading after a photo is removed or made main | Pass (focus first fell back to the top of the page, fixed) |
| A save that starts from an old photos list changes nothing, and the same list with its keys in another order still saves (tried with supabase-js as the officer) | Pass |
| A record sent like the phone does, as the test botanist, with 2 photos in `record-photos`: its edit page shows both through signed links | Pass |
| Its delete page says the 2 photos go too. After deleting, its photo folder is empty | Pass |
| A seed record with no photos says "No photos came with this record.", and a seed record that says it has photos explains they can't be found | Pass |

## Round 2: editing the caption and credit

Added on 29 Oct on the `photo-caption-edit` branch, on the same stand-in. Each photo on the species
edit page has "Edit caption and credit", which opens a small form with both filled in. It's a
`<details>` element, so it opens without JavaScript too. The server checks the same rules as an
upload (`checkPhotoDetails` in `web/src/lib/species-photos.ts`) and saves the same way as the other
photo changes, so a save from a photos list that changed first does nothing. The photo file itself
doesn't change.

| Test | Result |
| --- | --- |
| "Edit caption and credit" on the Belian photo opens the form with the saved caption and credit, and its label changes to "Close without saving" | Pass |
| Saving with an empty caption shows "Add a caption that says what the photo shows." under the label, marks the field invalid and moves focus to it | Pass |
| A new caption with extra spaces saves as "Caption and credit saved.", with the spaces tidied. The form closes, focus goes to the Photos heading, and the card and its alt text show the new caption | Pass |
| Opening the form again shows the new caption, not the old one | Pass |
| Typing a new credit and then closing the form throws the typing away | Pass |
| A new credit saved with the Enter key shows on the public plant page straight away | Pass |
| The form sent the way a browser without JavaScript sends it, with a blank caption: the page comes back with "Nothing was saved. Add a caption that says what the photo shows." and the caption doesn't change | Pass |
| The same, with the original caption: it saves, so the Belian photo was left as it started | Pass |
| `npm run lint`, `npx tsc --noEmit` and `npm run build` | Pass |

## Round 3: Remove asks first without JavaScript

Added on 29 Oct on the `remove-asks-without-js` branch, on the same stand-in. With JavaScript,
Remove already asked "Remove this photo?" before doing anything. Without it, the button removed
the photo straight away. Now the server only removes a photo when the form says it was confirmed.
The first press without JavaScript sends the page back with the same question on that photo, and
"Keep it" is a link that loads the page again.

| Test | Result |
| --- | --- |
| With JavaScript: Remove on the Tapang photo asks first and moves focus to the question. Keep it puts focus back on Remove, and nothing is removed | Pass |
| A test photo uploaded the way a browser without JavaScript sends it shows as photo 2 | Pass |
| Its Remove sent without JavaScript: the page comes back asking "Remove this photo? Its file is deleted too." on that photo only, and both photos are still there | Pass |
| The question's Remove sent from that page: "Photo removed.", and only the Tapang photo is left | Pass |
| `npm run lint`, `npx tsc --noEmit` and `npm run build` | Pass |

## Not tested yet

- A record that came from the app with photos the phone hasn't uploaded yet. The page has text for
  it, but it wasn't tried.
- The 12 photo limit through the page. The database test checks 13 is turned down.
- Keyboard-only use beyond the focus checks above, a screen reader, and the pages with JavaScript
  turned off, apart from the forms tried that way above.
- The pages against the hosted project, which needs 003 to 009 run first. The stand-in copies the
  buckets' size and file type limits, but Supabase's own Storage server hasn't been tried.

## Known limits

- **The plant list loads the full photo** (up to 1600 pixels) for small thumbnails.
  The image optimizer can't be used while we test against a local address. It's fine for a few
  species but should change before there are many.
- **Deleting an account doesn't delete its record photos.** The folder is named after the account,
  so the record edit page can't find them any more, and they stay in the bucket. Since 29 Oct
  `supabase/README.md` says to set the person's role back to `visitor` when they leave instead of
  deleting the account, which keeps the photos with their records.
- **Fixed on 29 Oct:** photos couldn't be edited, so changing a caption meant uploading the photo
  again. The caption and credit can now be changed (round 2). The photo itself still can't be
  swapped or cropped, so a new picture is still a new upload.
- **No history.** Nothing records who added or removed a photo.
