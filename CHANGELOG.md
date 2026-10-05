# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.2] - 2026-10-05

### Fixed

- The footer TPS entry no longer changes width while it repaints. All numeric
  fields are padded to constant widths (TPS 6, duration 5, TTFT 5 characters)
  and the TTFT segment is always rendered — `--` placeholder when the
  measurement is unknown — so the entry occupies one fixed width in every
  state (mid-stream, final, placeholder) instead of shifting the rest of the
  bar at every digit boundary. Inline transcript lines keep the compact
  format.

## [0.5.1] - 2026-10-05

### Fixed

- TTFT no longer accumulates across the rounds of one turn. The clock now
  resets at the start of every assistant request (user message, then each
  `toolResult` that feeds the next round) instead of only at the user message.
  Previously a turn with tool calls measured a later round's TTFT from the user
  message that began the turn, so the figure grew with every round.
  Measured over four rounds that each waited ~200 ms: 202 → 186 → 220 → 192 ms
  now, versus 203 → 733 → 1294 → 1839 ms before.

### Changed

- The footer no longer tags mid-stream values with `· live`. The number is
  transient either way, and `turn_end` replaces it with the exact figure, so
  the tag was noise. The `estimate` option in `formatTps()` is gone with it.

## [0.5.0] - 2026-10-05

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

### Changed

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
