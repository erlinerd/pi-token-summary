# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-09-20

### Added

- Inline transcript stats: a dim token/cost line appended to the conversation
  after agent replies, rendered via custom session entries
  (`appendEntry` + `registerEntryRenderer`) — never sent to the LLM, and
  historical lines re-render when a session is resumed.
- Display modes via `/token-summary verbose|brief|off`:
  - `verbose` — a line after every assistant message, including mid-turn
    tool-call messages
  - `brief` (default) — one line per turn, after the final non-`toolUse` message
  - `off` — no lines; totals keep counting and the report still works
- `/token-summary` (no args) prints the full session report plus the current
  mode.
- Mode is persisted to `~/.pi/agent/pi-token-summary.json` and survives
  restarts.
- Backwards compatible: historical lines written by v0.1.0 (`pi-exit-summary`)
  entries still render.

### Changed

- Renamed the package from `pi-exit-summary` to `pi-token-summary`.

## [0.1.0] - 2026-09-20

### Added

- Initial release (as `pi-exit-summary`): per-turn token/cost status line in
  the pi footer, plus an `/exit-summary` command printing the full session
  report.
