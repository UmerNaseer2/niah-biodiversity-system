# Item 41 lab checks: the innovation targets on the stand-in

These ran on 18 Nov 2026 (19 Nov in park time) on Umer's Mac. **They are lab checks, not field results.** Item 41 is meant to
be measured in the field with real phones, printed tags and people, and that hasn't happened. Every row
in the evaluation plan in [improved-workflow.md](../innovation/improved-workflow.md) stays "not yet
measured in the field". What we could do without a field trial was check the parts that don't need
one: the rules that hide plants, what happens when an upload is cut, how fast an alert gets to the
dashboard, and how long the phone takes to save offline. Item 41 stays open in
[sprint-2.md](../sprint-2.md).

Everything ran against the Supabase stand-in (`supabase/tests/stand-in.js`) with made up plants and
made up spots. No real endangered plant or real coordinate was used.

## Summary

| Measure | Target | Lab result | Field result |
| --- | --- | --- | --- |
| Exact spots of hidden plants in public pages and API answers | 0 | 0 found in 120 API reads and website pages | Not yet measured in the field |
| Data lost or saved twice after a cut upload | 0% lost, no copies | 0 lost, 0 copies over 13 cuts | Not yet measured in the field |
| Sensor alert to the dashboard | Under 30 s | 12.5 s and 6.6 s | Not yet measured in the field |
| Saving a record offline | Under 1 s | 33 to 257 ms over 3 saves, on a simulator | Not yet measured in the field |

## 1. Hidden plants don't leak

**Script:** `supabase/tests/leak-check.js`, with `leak.test.js` running the API part in the database
tests.

The script adds seven made up plants to the stand-in, each at its own made up spot, that must never
show an exact spot to the public:

| Plant | Why it's hidden |
| --- | --- |
| *Leakia critica* | Critically Endangered |
| *Leakia protecta* | Least Concern but marked protected |
| *Leakia officer* | An officer set it to rough area only |
| Named *Leakia common* but tagged as a different species | The name doesn't match the species |
| No species picked | Can't tell how rare it is |
| Waiting for review | Not approved yet |
| Rejected | Not approved |

Then, signed out with only the public key, it reads every table and view, calls every database
function and lists both photo buckets. After that it opens every public page on the website, the
hidden plants' species and tag pages, and every staff page, and follows links on the same site. In
each answer it looks for each spot written three ways: the full number, the number cut to 4 decimal
places, and rounded to 4 places.

| Part | Result |
| --- | --- |
| API, signed out | 67 requests: 14 answered 200, 42 answered 401 and 11 answered 404. 0 spots found |
| Website, signed out | 53 pages: 37 answered 200, 12 sent the visitor to the sign in page (307) and 4 answered 404. 0 spots found |

The seven plants have no later visits. Hiding a visit's spot is checked in `visits.test.js`
instead, including a visit to a hidden plant under a common name.

The public site does show a rough area for plants, on a grid of about 440 m. The script checks the
exact spots, not the rough ones, since showing a rough area is how it's meant to work.

```bash
cd supabase/tests && node leak-check.js --web http://127.0.0.1:3210
```

## 2. Cutting an upload part way

**Test:** `supabase/tests/cut-upload.test.js`

A small proxy sits between the sender and the stand-in and drops the connection at one of two points:
before the server has the whole request, or after the server has saved it but before the answer gets
back. The second is the harder one, since the sender thinks it failed and sends the same thing again.

| Case | Result |
| --- | --- |
| Phone record, cut before the server had it | Nothing saved. The next try saved it once |
| Phone record, cut after the server saved it | Saved once. The next try got "already there" (409), which the phone counts as synced. Still one copy |
| Ten phone records, cut at alternating points, then sent again | Each saved exactly once |
| 20 edge readings, cut after `edge-com` saved them, then sent again | 20 readings, 20 different sequence numbers |
| 20 edge readings, cut before `edge-com` had them | None saved. The next try saved all 20 |

All 5 passed. This uses the same "already there" check as the phone (`classifyUpload` in
`mobile/src/sync/upload-row.ts`). What it doesn't cover is a real weak signal, where a connection can
hang for a long time instead of dropping.

## 3. Sensor alert to the dashboard

**Script:** `supabase/tests/send-alert.js`

The stand-in and the website ran with the `supabase-stand-in` and `web-stand-in` launch settings, with
the admin signed in on the Sensors page. A small script in the page noted the time the alert first
showed. Then `send-alert.js` sent one soaked soil reading (raw 1450, about 98%) straight to
`edge-com`, the way the edge device sends a quick alert, and printed the time it sent it.

| Node | Sent | `edge-com` answered | Showed on the page | Time |
| --- | --- | --- | --- | --- |
| NNP-IOT-03 | 3:29:18.1 am | 200 in 1.75 s | 3:29:30.6 am | 12.5 s |
| NNP-IOT-02 | 3:29:57.9 am | 200 in 0.25 s | 3:30:04.5 am | 6.6 s |

Times are park time on 19 Nov. Most of the wait is the page itself, which checks again every 15
seconds. So the longest it should take is about 15 s plus the upload, which is under the 30 s target.
The first send was slower because the stand-in hadn't run `edge-com` yet. In the field, the node to
edge device step adds a little more. [Item 43](item-43-integration.md) timed that at 0.8 s with the
real edge device code and a fake node.

What this doesn't cover is the second half of the target, under 5% missing readings over 24 hours.
That needs a real node running for a day.

## 4. Saving a record offline

**How:** the app ran in Expo Go on the iPhone 17 Pro simulator, signed in as an officer, with the
stand-in stopped so there was no server to reach. A timing line was added to `save()` in
`mobile/src/app/(tabs)/new-record.tsx` for this run only and taken out afterwards. It timed from the
tap on Save record to the record and its photo rows being written to SQLite on the phone.

| Save | Photos | Time |
| --- | --- | --- |
| 1 | 1 | 257 ms |
| 2 | 0 | 33 ms |
| 3 | 2 | 81 ms |

All three were under 1 s and each showed straight away as "Pending sync". The first one was slower,
most likely because it was the first write since the app opened. Photos are shrunk and copied when
they're picked, not when Save is tapped, so the time to pick a photo isn't in these numbers.

A simulator runs on the Mac's processor, which is a lot faster than a cheap Android phone. So this
shows the save doesn't wait on the network, but the real time on a field phone still needs measuring.

## What's still for the field

- Real Android and iOS phones, in flight mode and on 4G
- GPS against marked points on open ground and in shade
- Printed tags scanned in sun, shade, wet and dirty
- A usability test with a SUS form
- A node running for 24 hours, and false alarms outdoors
- Paper against phone with the same people and plants
