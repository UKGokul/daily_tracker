# DayLens

**See what shapes your days.**

DayLens is a privacy-first, local-first personal analytics dashboard that combines lightweight task planning, custom habits/metrics, sleep, focus time, spending and daily notes into one understandable view of the day.

The original `daily_tracker` prototype hard-coded unrelated widgets and stored each day as an isolated browser object. DayLens rebuilds that idea around a configurable data model and a clearer product promise: **capture a small amount of information across your day, then learn from the patterns.**

## What makes it different

DayLens is deliberately not a replacement for Todoist, a banking app, MyFitnessPal, or a fitness platform. Specialist products go deeper. DayLens goes *across* domains so that you can ask questions such as:

- Is task completion different on days when I sleep at least seven hours?
- Do exercise days look different from non-exercise days?
- Is my focus time improving?
- Which weekday tends to carry the most spending?
- Which habits are consistent, and which are drifting?

The insight engine is deterministic and transparent; it reports associations, not causal claims.

## Features

- **Daily cockpit** with a weighted day score and signal summary.
- **Custom trackers**: boolean, counter, quantity, duration, rating, text, currency and time.
- **Flexible schedules** for daily, weekday, weekend and weekly trackers.
- **Tasks** with create, edit, complete, delete and undo.
- **Focus sessions** with break subtraction and overnight-session handling.
- **Sleep** with explicit previous-evening → current-morning semantics.
- **Money awareness** with income/expense categories and configurable currency.
- **Daily notes** with autosave.
- **Calendar** with per-day scores and activity indicators.
- **Insights** with 7/30/90-day and yearly ranges, trend visualization and a consistency heatmap.
- **Backup portability** through JSON export/import.
- **Calendar export** through `.ics`.
- **Offline PWA shell** via a service worker.
- **Optional Supabase sync** with email/password authentication and RLS-protected private snapshots.
- **Legacy migration** from the original `dailyTracker_YYYY-MM-DD` localStorage format.
- **Responsive and accessible UI** with mobile bottom navigation, keyboard focus states and reduced-motion support.

## Quick start

No build step is required.

```bash
git clone https://github.com/UKGokul/daily_tracker.git
cd daily_tracker
python -m http.server 8000
```

Open `http://localhost:8000`.

Run quality checks with:

```bash
npm run ci
```

## Optional cloud sync

DayLens works fully without an account. To enable Supabase sync:

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Copy `config.example.js` to `config.js`.
4. Add the project URL and **public anon key** to `config.js`.
5. Keep Row Level Security enabled; the included policies restrict snapshots to the authenticated owner.

`config.js` is ignored by Git so local credentials/configuration are not committed accidentally.

## Data and privacy

By default, all data remains in the browser under `daylens_state_v1`. DayLens contains no analytics SDK, ad SDK, or remote tracking. Cloud sync is explicit and optional.

## Architecture

The production v1 intentionally uses browser-native ES modules rather than prematurely adding a framework. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the tradeoffs, schema, analytics model, privacy decisions and future evolution path.

## Project structure

```text
.
├── index.html
├── manifest.webmanifest
├── service-worker.js
├── src/
│   ├── main.js
│   ├── store.js
│   ├── analytics.js
│   ├── cloud.js
│   ├── utils.js
│   └── styles.css
├── tests/
├── supabase/schema.sql
├── docs/ARCHITECTURE.md
└── .github/workflows/
```

## UX principles

1. **Awareness over guilt:** scores are context, not moral judgments.
2. **Progressive disclosure:** today's essential actions come first; configuration lives in Settings.
3. **Fast capture:** the app should be useful in under a minute a day.
4. **Local-first trust:** cloud features are optional.
5. **Explainable analytics:** users can understand where a number or insight came from.

## Status

DayLens 1.0 is a complete portfolio-oriented release of the original prototype. Future work can focus on conflict-aware multi-device sync, richer recurrence rules, native background reminders and—only after sufficient data quality—an optional AI narrative layer over the deterministic analytics.

## License

MIT © 2026 Gokul Udayakumar
