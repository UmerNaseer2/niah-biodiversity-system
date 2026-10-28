# Sprint #2 backlog

Sprint #2 Quality Review: date to be added (check with Dr. Lee). Report due at the end of the review week.
Item numbers match the Initial Release Schedule in the proposal. Tick items off as their pull requests are merged.

Owners are only filled in where the proposal schedule names one. Items with no owner are still to be assigned.

## Digital Plant Knowledge System (items 17 to 21)

| Item | Title | Depends on | Points | Owner | Done |
| --- | --- | --- | --- | --- | --- |
| 17 | Plant Record Editing & Deletion (Web) | Plant database, RBAC | 8 | Angel | [ ] In progress, see [test results](test-results/item-17-plant-edit-delete.md) |
| 18 | Botanical Photograph Upload & Gallery (Web) | Web platform, storage service | 8 | | [ ] |
| 19 | Observation Approval Workflow | Plant database, web platform | 8 | Angel | [ ] |
| 20 | Plant Species Distribution Maps (Basic) | Plant database, mapping library | 7 | | [ ] |
| 21 | Biodiversity Reports Generation & Export | Plant database, query engine | 7 | | [ ] |

Notes:

- Items 17 to 21 all read the plant tables, so check that items 14 and 16 are merged and the hosted Supabase project is up to date (`supabase/README.md`) before starting, or there's no data to show.
- Item 17 adds `supabase/008_record_edits.sql` (an `updated_at` on records). It has to be run on the hosted project after 003 to 007.
- Item 19 needs records coming in from the mobile app. Until the phone sync is real, test against the stand-in's records (`supabase/tests/stand-in.js`). It builds on the edit permissions from item 17.
- Item 18 has to deal with the private `record-photos` bucket, which has no replace or delete policy yet (005). The plant pages use the public `botanical-photos` bucket.

## Mobile ground-truthing and sync (items 9 to 12)

- [ ] 9. Offline Data Collection & Local Storage (started in Sprint #1, finishes here)
- [ ] 10. Data Synchronization Engine (Mobile ↔ Cloud)
- [ ] 11. Photograph Capture & Attachment (Mobile)
- [ ] 12. QR Code Generation for Plant Records

## Security (items 25 to 27)

- [ ] 25. Initial Security Penetration Testing
- [ ] 26. Vulnerability Remediation & Fixes
- [ ] 27. Security Reassessment & Verification

## Monitoring and data (items 30 to 33)

- [ ] 30. Real-Time Environmental Monitoring Dashboard
- [ ] 31. Threat Detection & Alert System
- [ ] 32. IoT Device Tracking & GPS Mapping
- [ ] 33. Ecological Data Storage & Analysis Module

## Verification and documentation (items 34 to 37)

- [ ] 34. Mobile-to-Web Data Sync Verification
- [ ] 35. API Documentation & Developer Guide
- [ ] 36. User Documentation (Mobile & Web)
- [ ] 37. Performance Optimization & Load Testing

## Innovation (items 38 to 41)

- [ ] 38. Analysis of Current Ground-Truthing Limitations
- [ ] 39. Proposed Innovative Workflow Design
- [ ] 40. Innovative Solution Implementation
- [ ] 41. Validation & Testing of Innovation

## Release (items 42 to 44)

- [ ] 42. Staging Environment Setup & Testing
- [ ] 43. Final System Integration Testing
- [ ] 44. Deployment to Production

Items 28 and 29 (IoT) aren't in this list yet. `docs/sprint-1.md` says item 28 is scheduled for Sprint #2, so check the proposal for both.

## Carried over from Sprint #1

(list anything not finished there, with the reason)
