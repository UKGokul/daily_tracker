# Changelog

## 1.0.0 — 2026-09-24

### Added
- Rebrand from DailyTracker to DayLens.
- Four-part information architecture: Today, Calendar, Insights and Settings.
- Configurable metric definitions and entries.
- Weighted daily score with user-adjustable weights.
- Task create/read/update/delete flow with undo on deletion.
- Focus/work sessions with duration, break and overnight handling.
- Explicit sleep semantics and duration calculation.
- Lightweight expense and income tracking with configurable currency.
- Daily notes with debounced autosave.
- Calendar score view and 120-day consistency heatmap.
- Deterministic personal insights and range summaries.
- JSON backup/export and import validation.
- Calendar `.ics` export for selected-day tasks.
- PWA service worker and offline shell.
- Optional Supabase email/password authentication and private snapshot sync.
- Legacy migration for `dailyTracker_YYYY-MM-DD` data.
- Keyboard focus states, labels, reduced-motion support and responsive mobile navigation.
- CI checks, automated tests, license and architecture documentation.

### Fixed
- Event listeners no longer accumulate on date navigation.
- Task completion is calculated as a percentage rather than a raw completed count.
- Hard-coded dollar formatting removed.
- Destructive actions support undo.
- Remote Chart.js and Font Awesome runtime dependencies removed.
