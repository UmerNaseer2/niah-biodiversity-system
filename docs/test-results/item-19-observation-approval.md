# Item 19 test results: observation approval workflow

Round 1 was on 31 Oct 2026 on Angel's Windows PC (Node 22) on the `item-19-observation-approval`
branch. The hosted Supabase project is behind on the SQL files (`supabase/README.md`), so the
pages were tried against the Supabase stand-in in `supabase/tests/stand-in.js`. It builds the same
database as the SQL tests, so Row Level Security, the column grants, the review trigger and the
views from our SQL files decide what comes back.

## What it does

The review queue (`/dashboard/review`) used to be mock data, and its buttons only changed the
page. Now it reads the real records.

- **Waiting** lists every record with the status "waiting", oldest first, from `records_staff`. A
  card shows the species, IUCN status, height, condition, photos, exact point, the ranger's note
  and checks: GPS accuracy, photos, whether the plant is matched to a species, whether the name
  disagrees with that species, and whether the ranger typed a common name we don't have for it. A
  plant with no species yet is marked as rough area only on the public site, because that's what
  the public view does. A link opens the record's edit page for its photos or to fix a mistake.
- **Approve** publishes the record. It goes on the public site straight away. It's refused while
  the record's name and its species link disagree (see Rules).
- **Reject** needs a reason, saved as the review note. The ranger's phone can show it once item 10
  downloads it. The website doesn't notify anyone itself, and the page says the reason is saved
  with the record rather than promising the ranger gets it.
- **Recently reviewed** lists the last 10 decisions with who made them and when. **Back to the
  queue** sends a record back to "waiting", so a mistake can be fixed.
- The database stamps who reviewed a record and when (006), and the edit history (013) logs every
  change of status and review note.
- No new SQL file. Officers and admins could already change a record's status and review note
  (004, 006).

## Rules

| Rule | Why |
| --- | --- |
| A decision only goes through if the record is still in the status the page showed, and nobody has saved it since | Two officers can't decide on the same record, and a record someone just edited isn't approved from an old page. It uses the same `updated_at` check as the edit and delete forms |
| Rejecting needs a reason, checked in the page and again in the server action | The ranger needs to know what to fix |
| Approving clears an old rejection reason. Sending a record back keeps it | A record that was fixed and approved shouldn't still say why it was rejected, and whoever looks at a reopened record can see why it was rejected |
| Only officers and admins | The action checks the role, and the database checks it again |
| Editing a record on the edit page (item 17) still never changes its status | Review and editing stay separate |
| Approving is refused while a record's name is a different plant from its linked species, checked on the server. Capitals and extra spaces don't count | The link decides how much of the spot the public sees. The phone and the edit form always save them together, so this only happens with a hand-made request or a renamed species. Saving the right name on the edit page puts the link right |
| A request that never comes back shows an error on the card and keeps the typed reason | It used to go to the error page and lose what was typed. Trying again is safe, because the version check spots a decision that did save |

## Automated checks

Run on Umer's Mac on 31 Oct 2026 after the fixes below.

| Check | Command | Result |
| --- | --- | --- |
| Database tests | `cd supabase/tests && npm test` | Pass, 241 of 241. 2 are new: officers and admins reopening a decided record and deciding again (the reviewer is stamped each time, a reopened record leaves the public view, and a botanist can't review), and a decision that only applies to the version the page loaded |
| Website lint | `cd web && npm run lint` | Pass |
| Types | `cd web && npx tsc --noEmit` | Pass |
| Production build | `cd web && npm run build` | Pass |

## Manual tests (stand-in, signed in as the test officer)

| Test | Result |
| --- | --- |
| The queue shows the real waiting record (NNP-D00D03, Tapang) instead of the mock records | Pass |
| Reject with the reason box empty is turned down with "Write a reason so the ranger knows what to fix." | Pass |
| Reject with a reason: the record leaves the queue and "Recently reviewed" shows Rejected, who did it, when and the reason | Pass |
| Back to the queue: the record is waiting again and shows the earlier review note | Pass |
| Edit the record in a second tab, then Approve from the first (stale) tab: refused with "Someone saved changes to this record after you opened the page...", and nothing changed | Pass |
| Reload and Approve: the record shows as Approved in "Recently reviewed", and the public tag page `/tag/NNP-D00D03` now exists | Pass |
| The edit page's history shows the review note being added | Pass |

## Round 2 (31 Oct 2026, Umer's Mac, stand-in)

The records below were sent to the stand-in's API as the test botanist, the way the phone sends
them, all linked to the made-up Least Concern species.

| Test | Result |
| --- | --- |
| Record named as a different species: the card says what the record says and what it's linked to | Pass |
| Approve that record: refused with "This record's name doesn't match the species it's linked to...", and it stays waiting | Pass |
| Save the right name on the edit page, reload, Approve: goes through | Pass |
| Same name with different capitals and spaces: approved with no warning | Pass |
| Common name we don't have for the species: shows a warning but can still be approved | Pass |
| Request fails while a reason is typed: error on the card, focus moves to it, the reason is still there and the page stays | Pass |
| Press Reject record again once the server is back: saved with the reason | Pass |
| Administrator: sees the queue and the waiting count | Pass |
| Botanist, researcher, visitor and an account with no profile: "No access" | Pass |
| Signed out: sent to the sign in page | Pass |
| 375 px wide: no sideways scrolling, buttons are 44 px tall | Pass |
| Keyboard only: Enter on Reject moves to the reason box, type, Tab, Enter rejects, focus lands on the "Waiting" heading | Pass |

## Not tested yet

- The queue with JavaScript turned off. Unlike the edit forms, the queue needs JavaScript, like the
  wireframe it replaced.
- With a screen reader. The page announces each decision and moves focus to the "Waiting" heading,
  but that wasn't tried with a screen reader.
- A rejected record's reason showing on the phone. That needs item 10.
- The pages against the hosted project, which needs 003 to 015 run first.
- A record that goes to "waiting" when someone reopens it from the records list. There's no button
  for that there, only in the queue.

## Known limits

- **Only decisions made on the website show under "Recently reviewed".** A status changed in the
  SQL editor has no reviewer or time, so it doesn't appear there.
- **No notification.** Nobody is told when their record is approved or rejected, until the phone
  downloads it with item 10.
- **No bulk approve.** Each record is decided on its own.
- **The checks are advice.** A record with a low GPS accuracy or no photo can still be approved.
