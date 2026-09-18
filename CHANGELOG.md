# Changelog

All notable changes to EchoDoc are documented here.
Format is loosely based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Migrated to TypeScript (2026-09-18)
- Ported all server + client + test sources from JavaScript to **TypeScript**
  (`src/*.ts`, `test/*.ts`) with `strict` mode. Public browser assets
  (`src/public/*.js`) stay as plain JS.
- Toolchain: `tsconfig.json` (build, `rootDir: src` → `dist`), `tsconfig.test.json`
  (typecheck incl. tests), `tsx` for running/tests, `scripts/copy-public.mjs` to
  bundle static assets into `dist/`.
- Scripts: `build` (tsc + copy public), `typecheck`, `start` now runs `dist/server.js`;
  tests run via `tsx`. CI now typechecks and builds before testing.
- Dockerfile is now multi-stage: compile in a build stage, ship only `dist/` +
  production deps in the runtime image.

## Hardening pass (2026-09-18)

### Security
- **Path-traversal protection** on static file serving. Requests are now resolved
  through `resolveSafePath()` and confined to `src/public/`; escape attempts
  (`/../`, encoded `..%2f`, malformed encodings) return `403`.

### Added
- Deterministic **offline unit suite** (`test/unit_offline.js`, 20 assertions):
  path-traversal guard, mock-mode detection, mock STT/Voice-Agent clients, tool
  execution against the clinical engine, and clinical-engine edge cases.
- **GitHub Actions CI** (`.github/workflows/ci.yml`) running the offline suite on
  Node 18/20/22, plus the live suite (auto-skips without a key).
- `src/util.js` with shared `resolveSafePath()` and `isMockMode()` helpers.
- New npm scripts: `test:offline`, `test:unit`. `engines.node` set to `>=18`.
- **Graceful shutdown** on `SIGTERM`/`SIGINT` (drains WebSocket clients, then exits).

### Changed
- **Per-connection clinical state.** Each `/ws` connection now gets its own
  `ClinicalEngine`, so concurrent consultations no longer share/clobber SOAP notes.
- **Connection timeouts** on both WebSocket clients (STT 10s, Voice Agent 12s) so a
  stalled endpoint rejects instead of hanging forever.
- **Token endpoints** (`/api/token`, `/api/token/agent`) now check the upstream
  response and propagate real error status (e.g. `401`/`502`) instead of masking
  failures as a `200` with a fake fallback token.
- **Live integration test** skips cleanly (exit 0) when no API key is present, so
  `npm test` is deterministic in CI. Run it explicitly with `npm run test:live`.

### Notes
- No functional/architecture change to the audio pipeline or the AssemblyAI v3
  streaming integration — this pass is robustness, safety, tests, and docs only.
