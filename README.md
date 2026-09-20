# pi-token-summary

[![CI](https://github.com/erlinerd/pi-token-summary/actions/workflows/ci.yml/badge.svg)](https://github.com/erlinerd/pi-token-summary/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

English | [中文](README.zh-CN.md)

**Inline token/cost stats for the pi coding agent.** After each agent reply, a dim stats line is appended to the conversation:

```text
↓1.2k this turn · Σ↓20.5k tok · ctx 63% · $0.11 · glm-5.3-flash
```

- **↓this turn**: output tokens of this reply
- **Σ↓**: cumulative session output
- **ctx**: context window usage
- **$**: cumulative cost
- model name

The stats line is a custom session entry (`appendEntry` + `registerEntryRenderer`): it renders in the TUI only, never enters LLM context, and historical lines re-render when a session is resumed.

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
pi install npm:pi-token-summary               # once published to npm
```

Takes effect in new sessions.

## Uninstall

```bash
pi uninstall pi-token-summary
```

## Development

```bash
npm install
npm test        # tsx --test
npx tsc --noEmit
```

## License

MIT
