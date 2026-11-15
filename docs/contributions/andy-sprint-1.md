# Andy Wei Jian Chu — Sprint 1 contribution evidence

Andy owns the data foundation work shared by the Digital Plant Knowledge
System team.

## Delivered

- Item 14 schema, seed data, and Supabase client integration in commit
  `2f1105b` on `item-14-plant-schema`.
- Shared Supabase project configuration and seeded dataset used to validate
  the web plant list, detail pages, and public record counts.
- Integration review and security hardening for items 14 to 16:
  coordinate-free public views, role-aware RLS, safe signup roles, and
  environment-variable compatibility.

## Evidence

- [Item 14 test results](../test-results/item-14-plant-schema.md)
- [Supabase schema](../../supabase/001_initial_schema.sql)
- [Security migration](../../supabase/004_security_hardening.sql)
- [Item 14 branch commit](https://github.com/UmerNaseer2/niah-biodiversity-system/commit/2f1105bb4d664b256460d82dc5628e5f7c185317)

The hosted Supabase migration was applied and verified on 15 October 2026.
Team review and Sprint 1 demonstration sign-off must still be recorded by the
team before the final report is submitted.

## Sprint 2 contribution

During Sprint 2, Andy helped connect and deliver the project's three main
runtime environments. The Supabase database and backend setup were completed
collaboratively with the other team members:

- Deployed the website to Vercel and configured it to use the hosted Supabase
  project.
- Worked with the team to create and configure the Supabase database,
  including the schema, migrations, authentication, Row Level Security
  policies and Storage used by the web application.
- Helped connect the web application and mobile application to the shared
  Supabase backend, keeping the public website, staff dashboard and field
  records on the same data source.
- Ran the Android version of the mobile application through Expo Go for
  device testing and demonstration.

Andy also implemented the Jira Sprint 2 items assigned to the web platform:

- **Item 18 — Botanical Photograph Upload & Gallery:** added species photo
  upload, validation, resizing, thumbnail generation, photo management and
  public galleries.
- **Item 20 — Plant Species Distribution Maps (Basic):** added interactive
  Leaflet/OpenStreetMap maps for species, tags and the staff dashboard,
  including protected-plant rough areas and accessible map descriptions.
- **Item 21 — Biodiversity Reports Generation & Export:** added real database
  reporting, filters, charts, print/PDF support and protected CSV export with
  exact-location controls.

## Sprint 2 evidence

- [Item 18 test results](../test-results/item-18-photo-gallery.md)
- [Item 20 test results](../test-results/item-20-maps.md)
- [Item 21 test results](../test-results/item-21-reports.md)
- [Web deployment documentation](../../web/README.md)
- [Mobile Expo Go documentation](../../mobile/README.md)
- [Supabase migrations](../../supabase/)

The Sprint 2 web features passed the documented lint, TypeScript and production
build checks. The photo feature's database test suite passed 164 of 164 tests.
