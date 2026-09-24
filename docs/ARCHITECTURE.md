# DayLens architecture

## Product boundary

DayLens is a **local-first personal analytics dashboard**, not an attempt to replace specialist task, finance, nutrition, fitness, or calendar products. Its job is to capture a small set of daily signals and make relationships between them understandable.

## Why this implementation is dependency-light

The previous prototype was five static files. A framework migration was considered, but the first production-quality release deliberately uses standards-based ES modules rather than adding a framework and build chain before the product model is stable. This gives DayLens:

- instant GitHub Pages deployment;
- offline-first PWA behavior;
- no client framework dependency or supply-chain churn;
- browser-native accessibility and form controls;
- a small runtime footprint;
- straightforward migration to React/Next.js later if the interaction surface justifies it.

The code is nonetheless separated by responsibility:

- `src/main.js` — UI composition, routing and interaction orchestration;
- `src/store.js` — state schema, persistence, validation and legacy migration;
- `src/analytics.js` — pure analytics functions and deterministic insights;
- `src/cloud.js` — optional Supabase authentication and snapshot sync;
- `src/utils.js` — date, duration, formatting and metric helpers;
- `service-worker.js` — offline asset caching.

## Data model

The application state contains:

- metric definitions (`boolean`, `counter`, `quantity`, `duration`, `rating`, `text`, `currency`, `time`);
- metric entries keyed by metric and date;
- tasks;
- focus/work sessions;
- sleep records;
- finance entries;
- daily notes;
- user settings and score weights.

This replaces the previous hard-coded `joints`, `bath`, `food`, etc. object shape. The migration layer converts old `dailyTracker_YYYY-MM-DD` localStorage records into the new model without deleting the old keys.

## Storage and sync

`localStorage` is the primary source of truth in v1. Export/import gives the user a portable backup. Optional Supabase sync stores an atomic JSON snapshot in `daylens_snapshots`; Row Level Security restricts the row to its authenticated owner.

The snapshot approach is a deliberate v1 tradeoff. If DayLens later needs server-side querying or multi-device conflict resolution, the domain entities can be normalized into relational tables without changing the UI model.

## Analytics

All analytics are deterministic and calculated in the browser. The app currently computes:

- true task completion rate;
- focus duration with break subtraction and overnight handling;
- sleep duration with explicit date semantics;
- habit consistency and streaks;
- weighted day scores;
- range summaries;
- descriptive sleep/task and exercise/task associations;
- spending weekday patterns;
- momentum across a selected period.

Insight copy explicitly describes associations rather than claiming causation.

## Security and privacy

- Data is local by default.
- Cloud sync is opt-in.
- Supabase's public anon key is safe to expose only with the included RLS policies enabled.
- User-provided text is escaped before insertion into HTML templates.
- Imports are structurally validated before replacing local state.
- No analytics SDK, ad SDK, or remote tracking is included.

## Future evolution

A framework migration becomes worthwhile if DayLens adds collaboration, complex server rendering, a plugin marketplace, or a significantly larger component surface. AI-generated summaries should remain an interpretation layer over deterministic metrics rather than a replacement for transparent calculations.
