# Sprint #1 backlog

Sprint #1 Quality Review: Week 6 (Oct 5). Report due end of Week 6, signed off by Dr. Lee in
consultation hours. Item numbers match the Initial Release Schedule in the proposal. Tick items off
as their pull requests are merged.

## Pre-sprint

- [ ] 1. System Architecture & Database Design

## Foundation layer (owner to be decided)

- [ ] 2. User Authentication & Authorisation System (Supabase Auth)
- [x] 3. Cloud Infrastructure Setup & Data Sync Framework (Supabase project, Storage), the
  Sprint #1 part ([test results](test-results/item-3-cloud-sync.md)). The phone starts using it
  in item 10. The hosted project still needs 003 to 007 run, in order, see
  [supabase/README.md](../supabase/README.md).
- [x] 4. Role-Based Access Control (Row Level Security policies)
  ([test results](test-results/item-4-access-control.md)). The hosted project still needs 003
  to 007 run, in order.

## Smart Digital Ground-Truthing Platform (Frederick, Umer)

- [x] 5. Mobile App Skeleton & Navigation ([test results](test-results/item-5-mobile-skeleton.md))
- [x] 6. QR Code Scanner Integration ([test results](test-results/item-6-qr-scanner.md))
- [x] 7. Basic Plant Record Form (Mobile) ([test results](test-results/item-7-record-form.md))
- [x] 8. GPS Location Capture & Tracking ([test results](test-results/item-8-gps.md))
- [x] 9. Offline Data Collection & Local Storage, the Sprint #1 part
  ([test results](test-results/item-9-offline-storage.md)). The rest finishes in Sprint #2, see
  below.

## Digital Plant Knowledge System (Angel, Andy)

- [ ] 13. Web Platform Skeleton & Dashboard (clickable wireframe is in, see
  [test results](test-results/item-13-web-wireframe.md). Angel and Andy to check it before we tick
  it)
- [x] 14. Plant Database Schema & CRUD Operations
  ([test results](test-results/item-14-plant-schema.md)). Officers add, edit and delete species
  on the website. The hosted project still needs 003 to 007 run before those pages work there.
- [x] 15. Conservation Officer Authentication (Web)
  ([test results](test-results/item-15-officer-auth.md))
- [x] 16. Plant Information Display & Search (Basic)
  ([test results](test-results/item-16-plant-search.md))

## Cybersecurity & Data Protection (Jason)

- [ ] 22. Data Encryption (At-Rest)
- [ ] 23. Data Encryption (In-Transit)
- [ ] 24. Application Vulnerability Assessment Plan

## IoT-Enabled Plant Protection (Rukman, Bryan)

No items scheduled until Sprint #2 (Item 28, IoT Device Integration Framework).
Suggested Sprint #1 prep: get one ESP32 reading the DHT11 and soil moisture sensor and printing to
serial.

## Carried over to Sprint #2

- Item 9, saving photos on the phone with their record. Needs item 11 to take the photos first.
- Item 9, keeping the species list on the phone, and the queue of records waiting to upload. Both
  need item 10 (sync with Supabase) first.
- Item 9, a FlatList for My Records so it stays smooth with hundreds of records. It can't go inside
  the ScrollView every screen uses, so the screen needs reworking for it.

## Contribution evidence

- [Andy Wei Jian Chu: Sprint 1 contribution evidence](contributions/andy-sprint-1.md)
