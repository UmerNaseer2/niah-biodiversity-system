# Sprint #2 backlog

Sprint #2 Quality Review: Week 8 (Oct 26). Report due at the end of Week 9 (Nov 8).
Item numbers match the Initial Release Schedule in the proposal. Tick items off as their pull requests are merged.

Owners are only filled in where the proposal schedule names one, or where someone has picked the item up. Items with no owner are still to be assigned.

## Digital Plant Knowledge System (items 17 to 21)

| Item | Title | Depends on | Points | Owner | Done |
| --- | --- | --- | --- | --- | --- |
| 17 | Plant Record Editing & Deletion (Web) | Plant database, RBAC | 8 | Angel | [x] Merged 29 Oct, see [test results](test-results/item-17-plant-edit-delete.md) |
| 18 | Botanical Photograph Upload & Gallery (Web) | Web platform, storage service | 8 | Umer | [x] Merged 29 Oct, see [test results](test-results/item-18-photo-gallery.md) |
| 19 | Observation Approval Workflow | Plant database, web platform | 8 | Angel | [x] Merged 31 Oct, see [test results](test-results/item-19-observation-approval.md) |
| 20 | Plant Species Distribution Maps (Basic) | Plant database, mapping library | 7 | Umer | [x] Merged 29 Oct, see [test results](test-results/item-20-maps.md) |
| 21 | Biodiversity Reports Generation & Export | Plant database, query engine | 7 | Umer | [x] Merged 29 Oct, see [test results](test-results/item-21-reports.md) |

Notes:

- Items 17 to 21 all read the plant tables, so the hosted Supabase project has to be up to date (`supabase/README.md`) before they show real data there. Until then they're tested on the stand-in (`supabase/tests/stand-in.js`).
- Item 17 adds `supabase/008_record_edits.sql` (an `updated_at` on records). It has to be run on the hosted project after 003 to 007.
- Item 19 builds on the edit permissions from item 17. It's tested with records sent to the stand-in's API the way the phone sends them.
- Item 18 adds `supabase/009_species_photos.sql`, which checks species photos and lets officers and admins delete record photos, so deleting a record deletes its photos too. It has to be run on the hosted project after 008. The plant pages use the public `botanical-photos` bucket.

## Mobile ground-truthing and sync (items 9 to 12)

- [x] 9. Offline Data Collection & Local Storage (started in Sprint #1). Merged 29 Oct, see
  [test results](test-results/item-9-offline-storage.md)
- [x] 10. Data Synchronization Engine (Mobile ↔ Cloud). Merged 31 Oct, see
  [test results](test-results/item-10-sync.md). Tried on the iOS simulator against the stand-in, not
  on Android, a real phone or hosted.
- [ ] 11. Photograph Capture & Attachment (Mobile)
- [ ] 12. QR Code Generation for Plant Records

## Security (items 25 to 27)

- [x] 25. Initial Security Penetration Testing. Done 31 Oct on Umer's Mac against a local production
  build and the stand-in, see [test results](test-results/item-25-27-security.md). OWASP ZAP,
  Security Advisor and SSL Labs didn't run.
- [x] 26. Vulnerability Remediation & Fixes. Both highs, 5 of 7 mediums and 5 of 14 lows are fixed in
  our code, with SQL 019 to 021. The hosted project doesn't have them until Umer runs 003 to 021 and
  the site is deployed.
- [ ] 27. Security Reassessment & Verification. Partly done. Everything from item 25 that ran was run
  again on the fixed code and compared, and nothing widened. ZAP and a reassessment on the hosted
  project are still to do.

## IoT and monitoring (items 28 to 31)

- [x] 28. IoT Device Integration Framework. Merged 31 Oct, see
  [test results](test-results/item-28-iot-framework.md). Sketches compile but haven't been flashed.
- [x] 29. Sensor Data Collection Pipeline. Merged 31 Oct, see
  [test results](test-results/item-29-sensor-pipeline.md). Tested with the simulator, not on hardware.
- [x] 30. Real-Time Environmental Monitoring Dashboard. Merged 31 Oct, see
  [test results](test-results/item-30-monitoring-dashboard.md).
- [x] 31. Threat Detection & Alert System. Merged 31 Oct, see
  [test results](test-results/item-31-threat-alerts.md). The limits are starting values to tune.

## Innovation, first half (items 38 and 39)

- [x] 38. Analysis of Current Ground-Truthing Limitations. Merged 31 Oct, see [the analysis](innovation/ground-truthing-limitations.md)
- [x] 39. Proposed Innovative Workflow Design. Merged 31 Oct, see [the design](innovation/improved-workflow.md)

## Carried over from Sprint #1

- Item 9, keeping the species list on the phone, the queue of records waiting to upload, and a
  FlatList for My Records. Done 29 Oct. Saving photos on the phone with their record moved to
  item 11, since that's the item that takes them.
- Item 2, signing in on the phone, merged 31 Oct with item 10. Inviting people, changing roles and
  deactivating accounts on the website's Users and roles page were merged 31 Oct, see
  [test results](test-results/item-2-admin-users.md).
- Item 22, encryption at rest on the phones. Jason's SQLCipher branch needs fixing before it can be
  merged ([where it stands](security/encryption-at-rest.md)).
- Item 23, checking HTTPS on the real site. It gets checked once the website is deployed.
- Item 24, Jason still reviews the vulnerability assessment plan.
- The hosted Supabase project still needs 003 to 021 run, in order (`supabase/README.md`). Only
  Umer can do this.

# After Sprint #2 (Weeks 10 to 11)

These are scheduled for Weeks 10 to 11 in the proposal, after the Sprint #2 review.

## Monitoring and data (items 32 and 33)

- [ ] 32. IoT Device Tracking & GPS Mapping
- [ ] 33. Ecological Data Storage & Analysis Module

## Verification and documentation (items 34 to 37)

- [ ] 34. Mobile-to-Web Data Sync Verification
- [ ] 35. API Documentation & Developer Guide
- [ ] 36. User Documentation (Mobile & Web)
- [ ] 37. Performance Optimization & Load Testing

## Innovation, second half (items 40 and 41)

- [ ] 40. Innovative Solution Implementation
- [ ] 41. Validation & Testing of Innovation

## Release (items 42 to 44)

- [ ] 42. Staging Environment Setup & Testing
- [ ] 43. Final System Integration Testing
- [ ] 44. Deployment to Production
