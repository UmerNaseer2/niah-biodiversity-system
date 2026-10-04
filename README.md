# Smart Ground-Truthing and Digital Biodiversity System

COS30049 Computing Technology Innovation Project, Semester 2 2026.
Client: Sarawak Forestry Corporation (SFC), Niah National Park. Industry partner: NeuonAI.

## What's in this repo

| Folder | What it is | Stack | Owners |
|---|---|---|---|
| `mobile/` | Smart Digital Ground-Truthing Platform (field app for botanists) | React Native, Expo, SQLite | Frederick, Umer |
| `web/` | Digital Plant Knowledge System (public plant pages + staff dashboard) | Next.js on Vercel | Angel, Andy |
| `supabase/` | Database schema, Row Level Security policies, migrations | Supabase (PostgreSQL + PostGIS, Auth, Storage) | All |
| `iot/` | IoT plant protection (ESP32 sensor nodes, edge device) | Arduino / ESP32 | Rukman, Bryan |
| `docs/` | Architecture diagrams, sprint notes, test results | | All |

Cybersecurity and data protection (Jason) runs across all of the above.

## Team

| Name | Role |
|---|---|
| Umer | Group leader, web platform developer |
| Frederick | AI member |
| Angel | Web platform developer |
| Andy | Data science member |
| Jason | Cybersecurity member |
| Rukman | IoT member |
| Bryan | IoT member |

## Getting started

You need Node.js 20 or newer, Git (or GitHub Desktop), and the Expo Go app on your phone.

### Mobile app

```bash
cd mobile
npm install
cp .env.example .env
npx expo start
```

Scan the QR code in the terminal with Expo Go (Android) or the Camera app (iPhone).
Your phone and laptop need to be on the same WiFi.

### Web platform

```bash
cd web
npm install
cp .env.example .env.local
npm run dev
```

Then open http://localhost:3000.

### Keys

Ask Umer for the Supabase URL and anon key and put them in your own `.env` / `.env.local`.
**Never commit real keys.** The `.gitignore` files already block `.env` files, only the `.env.example` files are committed.
The Supabase service role key is only ever used on the server (Vercel env variables), never in the mobile app or browser code.

## How we work

See [CONTRIBUTING.md](CONTRIBUTING.md). Short version: never push straight to `main`, make a branch, open a pull request, get one teammate to review it.

## Sprints

| Sprint | Weeks | Review | Report due |
|---|---|---|---|
| Sprint #1 | Week 4 to 6 | Week 6 (Oct 5) | End of Week 6 |
| Sprint #2 | Week 7 to 9 | Week 8 (Oct 26) | End of Week 9 |
| Final integration and testing | Week 10 to 11 | | |
| Final presentations | Week 11 to 12 | | Portfolio end of Week 12 |

Sprint #1 backlog: [docs/sprint-1.md](docs/sprint-1.md)
