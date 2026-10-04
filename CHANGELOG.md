# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- TPS in pi's footer, resident and live: `ctx.ui.setStatus()` appends a status
  entry next to the default footer (the default footer is never replaced).
  During a stream it shows a live estimate (`⚡12.3 tok/s (3.2s · live)`),
  then the exact value once `turn_end` usage arrives. Every streamed chunk
  repaints the entry directly — no throttle, no easing. Independent of the
  inline mode: `off` hides the transcript line only, the footer keeps updating.
- Speed color ramp on the footer icon and number, dim-and-red when slow,
  bright-and-bold when fast: `#A31010` under 10, `#E3170D` under 30,
  `#EF7C00` under 60, `#B8D430` under 90, bold `#7CFC00` under 120, bold
  `#39FF8E` at 120+. Hue travels red → green and luminance rises monotonically
  across the bands.
- TPS unit label changed from `t/s` to `tok/s`.

## [0.4.0] - 2026-10-02

### Changed

- Status line icons: `⟳` replaces 本轮, `⚡` marks the TPS segment, `Σ`
  replaces `Σ↓`, and the redundant `tok` suffix is dropped.

## [0.3.0] - 2026-10-01

### Added

- Per-stream TPS segment in the inline stats line, e.g.
  `TPS: 1600.0 tok/s (641 tok in 4.9s · TTFT: 6282 ms)`. Timing follows
  pi-token-speed semantics: user message → first streamed content for TTFT,
  first content event → stream end for duration, measured independently per
  assistant stream across tool-call rounds. The segment is omitted when
  timing is missing or degenerate (0 tok / 0 duration / negative TTFT).

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
