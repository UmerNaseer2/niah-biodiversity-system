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
  and three checks: GPS accuracy, photos, and whether the plant is matched to a species. A plant
  with no species yet is marked as rough area only on the public site, because that's what the
  public view does. A link opens the record's edit page for its photos or to fix a mistake.
- **Approve** publishes the record. It goes on the public site straight away.
- **Reject** needs a reason, saved as the review note. The ranger's phone can show it once item 10
  downloads it. The website doesn't notify anyone itself.
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

## Automated checks

| Check | Command | Result |
| --- | --- | --- |
| Database tests | `cd supabase/tests && npm test` | Pass, 241 of 241. 2 are new: officers and admins reopening a decided record and deciding again (the reviewer is stamped each time, a reopened record leaves the public view, and a botanist can't review), and a decision that only applies to the version the page loaded |
| Website lint | `cd web && npm run lint` | Pass |
| Types | `cd web && npx tsc --noEmit` | Pass |

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

## Not tested yet

- The queue as an admin, a botanist (should get "No access") or a visitor.
- The queue with JavaScript turned off. Unlike the edit forms, the queue needs JavaScript, like the
  wireframe it replaced.
- At phone width, with only a keyboard, or with a screen reader. The page announces each decision
  and moves focus to the "Waiting" heading, but that wasn't tried with a screen reader.
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
