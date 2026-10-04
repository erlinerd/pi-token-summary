# pi-token-summary

[![CI](https://github.com/erlinerd/pi-token-summary/actions/workflows/ci.yml/badge.svg)](https://github.com/erlinerd/pi-token-summary/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

English | [中文](README.zh-CN.md)

**Inline token/cost stats for the pi coding agent.** After each agent reply, a dim stats line is appended to the conversation:

```text
↓1.2k ⟳ · Σ20.5k · ctx 63% · ⚡130.8 tok/s (4.9s · TTFT 6282ms) · $0.11 · glm-5.3-flash
```

- **↓this turn**: output tokens of this reply
- **Σ**: cumulative session output
- **ctx**: context window usage
- **$**: cumulative cost
- model name

The stats line is a custom session entry (`appendEntry` + `registerEntryRenderer`): it renders in the TUI only, never enters LLM context, and historical lines re-render when a session is resumed.

The latest turn's TPS is kept **resident in pi's footer** as a status entry (`ctx.ui.setStatus`) — the default footer is kept, this only adds to it. While a stream is in flight it shows the running TPS (`⚡12.3 tok/s (3.2s)`), then the exact value once usage lands. Every streamed chunk repaints it — no throttle, no easing — so the number moves at the pace the provider streams. The ⚡ icon and number are colored by speed, dim red when slow and bright emboldened green when fast: `#A31010` under 10, `#E3170D` under 30, `#EF7C00` under 60, `#B8D430` under 90, bold `#7CFC00` under 120, bold `#39FF8E` at 120+. The footer is independent of the inline mode: `off` hides the transcript line only.

## Display modes

```bash
/token-summary verbose   # after EVERY assistant message (incl. tool-call turns)
/token-summary brief     # once at the end of each turn (default)
/token-summary off       # no inline lines; totals still tracked, report works
/token-summary           # full session report + current mode
```

The mode persists in `~/.pi/agent/pi-token-summary.json` across restarts. Default: **brief**.

Note: pi's `turn_end` event fires after **every** assistant message; a turn with tool calls produces multiple messages. `verbose` shows each one, `brief` shows once when `stopReason` is not `toolUse` (i.e. the turn truly ended).

## How it works

pi's extension API provides the message `usage` on `turn_end`; `pi.appendEntry()` persists the rendered line to the session file and `pi.registerEntryRenderer()` renders it dim in the transcript.
Cumulative values are seeded from the session file at startup, so resumed sessions continue accurately. Purely local — no network requests.


## Install

```bash
pi install github:erlinerd/pi-token-summary   # GitHub
pi install npm:@erlin-ai/pi-token-summary               # once published to npm
```

Takes effect in new sessions.

## Uninstall

```bash
pi uninstall @erlin-ai/pi-token-summary
```

## Development

```bash
npm install
npm test        # tsx --test
npx tsc --noEmit
```

## License

MIT
