# Website review fixes test results

Round 1 was on 29 Oct 2026 on Umer's Mac (macOS, Node 22.22.3) on the `web-review-fixes`
branch. The pages were tried against the Supabase stand-in in `supabase/tests/stand-in.js` (see
`web/README.md`), with the stand-in's own sample records and test accounts, not the hosted project.
Round 2, on 30 Oct, fixed what a second review of the whole project found, one branch per fix. See
round 2 below.

## What changed

A review of the staff pages found a few places where the website trusted what was typed a bit too
much, and a couple of photo problems.

- **Species names with a `*`** on the record edit page. The page finds the species for a name by
  matching it in `species_staff`, and the API reads a `*` in that pattern as "anything". So a
  name like `Shorea*` could link the record to whichever Shorea species came back. A name with a
  `*` now never links to a species, since no scientific name has one in it.
- **The date and time a plant was recorded** now has to be a real time. Before, `25:00` or `10:61`
  got past the check because only the date part was looked at.
- **The CSV report** already put a `'` in front of a cell starting with `=`, `+`, `-` or `@`, so
  Excel shows it instead of running it as a formula (item 21). Now it does the same when there
  are spaces before the sign, or when the sign is the full width one a phone keyboard can type,
  since some spreadsheets still run those.
- **Species photos on the edit page** are picked by their place on the page as well as their key.
  Two photos with the same outside link used to share a key, so making one main or removing it
  could change the other one. The server checks the place still matches the key, and if the
  photos changed since the page loaded it finds the photo by key instead. The confirm step for
  removing a photo goes by place too, so only the photo that was clicked asks to be removed.
- **Photo descriptions for screen readers.** The upload form needs a caption, but a photo put in
  the database another way can have an empty one, and then it had an empty description that a
  screen reader skips. It now reads "A photo of" and the plant's name, on the plant page, the tag
  page and the edit page.

## Automated checks

| Check | Command | Result |
| --- | --- | --- |
| Website lint | `cd web && npm run lint` | Pass |
| Types | `cd web && npx tsc --noEmit` | Pass |
| Build | `cd web && npm run build` | Pass, all 22 routes. Only the two font warnings `web/README.md` explains |

The website has no unit tests yet, so the two rules were also run in a throwaway node script:

| Rule | Inputs | Result |
| --- | --- | --- |
| CSV cells get a `'` | `" =1+1"`, a full width space then `=cmd`, `＝SUM(A1)`, `- note` | All 4 get a `'` |
| CSV cells left alone | `Shorea`, and a note with a `-` in the middle | Both left alone |
| Recorded time | `T24:00`, `T10:60`, 30 February | All 3 turned down |

Nothing in the database or the phone app changed.

## Manual tests (stand-in)

The site ran with `npm run dev`. Throwaway scripts signed in as the test officer through the real
login form and sent the real forms. They only printed status codes, form messages and the fields
being checked.

| Test | Result |
| --- | --- |
| Before the fix: saving a record with the species name `Standinia*` linked it to a species | The bug showed up |
| After the fix: the same name saves with no species link | Pass |
| Putting the name back to `Standinia exacta` links the species again | Pass |
| Saving a record with hour 25, then with minute 61 | Both say "Enter the date and time it was recorded." and nothing is saved |
| Uploading a photo to Belian, making it main, making the first one main again, then removing the new one | Pass, every step. Belian is back to its one photo |
| Each photo form on the edit page sends its place on the page | Pass |
| No errors in the dev server log | Pass |

## Round 2: second review

A second review on 30 Oct read every page again, this time looking for crashes on missing data,
screen reader problems and anything that could show a hidden plant's spot. Nothing showed a
hidden spot. Each fix below was tried on the stand-in the same way as round 1.

| Branch | What was wrong | Now |
| --- | --- | --- |
| `tag-error-alert` | On the Scan a tag page, typing a bad code and pressing Enter showed an error that a screen reader never read out, since the field already had focus and nothing moved | The error is an alert, and it's put back in the page each time a bad code is sent, so it's read out every time |

| Test | Result |
| --- | --- |
| Typed `NNP-12` in the tag code box and pressed Enter | The error shows with `role="alert"`, the box is marked invalid and keeps focus |
| Pressed Enter again with the same code | A new error is put in the page, so it's read out again. The page stays on `/tag` |

## Not tested yet

- A photo with an empty caption. The upload form won't take one (tried, it asks for a caption),
  so the fallback description was read, not tried.
- Two photos with the same outside link. The stand-in only stores uploads, so the code for that
  case was read, not tried.
- The hosted Supabase project, which needs 003 to 009 run first.
