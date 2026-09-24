# Contributing

DayLens favors small, testable changes and explicit product behavior.

## Local development

Serve the repository with any static web server, for example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Quality checks

```bash
npm run ci
```

This performs JavaScript syntax checks and runs the Node test suite.

## Commit style

Use concise conventional-style commits where practical:

- `feat:` user-visible capability
- `fix:` behavior correction
- `test:` test-only changes
- `docs:` documentation
- `refactor:` behavior-preserving implementation change
- `chore:` tooling or maintenance

Do not rewrite history to manufacture development activity.
