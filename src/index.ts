/**
 * pi-token-summary — token/cost stats for pi.
 *
 * INLINE: after agent turns, a dim stats line is appended to the transcript:
 *      ↓1.2k ⟳ · Σ20.5k · ctx 63% · ⚡130.8 tok/s (4.9s · TTFT 6282ms) · $0.11 · glm-5.3-flash
 * (pi.appendEntry + pi.registerEntryRenderer: persists in the session file,
 * re-renders on resume, never sent to the LLM.)
 *
 * Display modes via /token-summary verbose|brief|off,
 * persisted in ~/.pi/agent/pi-token-summary.json:
 *   - brief   简略 (default): only at the end of each user round
 *   - verbose 详细: after EVERY assistant message (incl. tool-call rounds)
 *   - off     关: no inline lines; totals still tracked for the report
 *
 * `/token-summary` (no args) prints the full session report + current mode.
 *
 * FOOTER: the TPS figure is kept resident in pi's footer as a status entry
 * (ctx.ui.setStatus — appended next to the default footer, never replacing it).
 * While a stream is in flight it shows a live estimate (`⚡12.3 tok/s (3.2s ·
 * live)`), then the exact turn value once usage lands. Every content delta
 * repaints it — no throttle, no easing. The ⚡ icon and number are color-banded
 * by speed. Independent of the inline mode: `off` hides the transcript line
 * only, the footer keeps updating.
 */
import { Text } from "@earendil-works/pi-tui";
import {
  estimateTokens,
  formatTps,
  renderLine,
  renderStatus,
  summarizeSessionFile,
} from "../lib/summarize";
import type { TurnTiming } from "../lib/summarize";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

interface Usage {
  output?: number;
  totalTokens?: number;
  cost?: { total?: number };
}

interface Cumulative {
  turns: number;
  output: number;
  cost: number;
  lastTokens: number;
  model: string;
}

type Mode = "verbose" | "brief" | "off";

const MODE_LABEL: Record<Mode, string> = {
  verbose: "详细（每条消息后显示）",
  brief: "简略（每轮末尾显示）",
  off: "关（不显示）",
};

const ENTRY_TYPE = "token-summary-turn";
const FOOTER_KEY = "token-summary";
const CONFIG_PATH = join(
  process.env.PI_HOME ?? join(homedir(), ".pi"),
  "agent",
  "pi-token-summary.json",
);

function loadMode(): Mode {
  try {
    const j = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    if (j?.mode === "verbose" || j?.mode === "brief" || j?.mode === "off") {
      return j.mode;
    }
  } catch {
    // missing/unreadable config → default
  }
  return "brief";
}

function saveMode(mode: Mode): void {
  try {
    mkdirSync(join(CONFIG_PATH, ".."), { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify({ mode }, null, 2) + "\n");
  } catch {
    // never break a command over config I/O
  }
}

function parseMode(arg: string): Mode | null {
  const a = arg.trim().toLowerCase();
  if (a === "verbose") return "verbose";
  if (a === "brief") return "brief";
  if (a === "off") return "off";
  return null;
}

export default function (pi: any) {
  let cum: Cumulative = {
    turns: 0,
    output: 0,
    cost: 0,
    lastTokens: 0,
    model: "",
  };
  let seeded = false;
  let mode: Mode = loadMode();

  // Per-stream timing for the TPS segment. Semantics follow pi-token-speed:
  // TTFT = user message → first streamed content of the current assistant
  // stream; duration = first content → turn_end of the same stream.
  let ttftStart = 0;
  let streamStart = 0;
  let ttftMs: number | null = null;

  // Live footer: estimated output tokens of the current stream. Every content
  // delta repaints the status entry — no throttle, no easing — so the number
  // moves at the pace the provider streams. Exact usage corrects it at
  // turn_end. The entry stays resident once set.
  let liveTokens = 0;
  // Division sanity: an elapsed time below this would print an absurd rate
  // (e.g. the first delta of a stream, ~5 ms in).
  const LIVE_MIN_DURATION_MS = 100;

  // ---------- inline transcript line ----------
  const renderEntry = (entry: any, _opts: any, theme: any) => {
    const line: string | undefined = entry?.data?.line;
    return new Text(line ? theme.fg("dim", line) : "");
  };
  pi.registerEntryRenderer(ENTRY_TYPE, renderEntry);

  // ---------- shared helpers ----------
  function seedFromFile(ctx: any) {
    if (seeded || !ctx.sessionFile) return;
    seeded = true;
    try {
      const s = summarizeSessionFile(ctx.sessionFile);
      cum = {
        turns: s.turns,
        output: s.output,
        cost: s.cost,
        lastTokens: s.lastTokens,
        model: s.model,
      };
    } catch {
      // fresh session without file yet — start from zero
    }
  }

  function contextPercent(ctx: any): number | null {
    try {
      const u = ctx.getContextUsage?.() ?? null;
      if (u && typeof u.percent === "number") return u.percent;
      if (
        u &&
        typeof u.tokens === "number" &&
        typeof u.contextWindow === "number" &&
        u.contextWindow > 0
      ) {
        return (u.tokens / u.contextWindow) * 100;
      }
    } catch {
      // stats line must never break the turn
    }
    return null;
  }

  // ---------- events ----------
  pi.on("session_start", async (_event: any, ctx: any) => {
    seeded = false;
    seedFromFile(ctx);
    // Footer is per-session state: drop the previous session's value. The next
    // stream's first delta re-creates it.
    liveTokens = 0;
    try {
      ctx.ui.setStatus(FOOTER_KEY, undefined);
    } catch {
      // footer is best-effort
    }
  });

  pi.on("message_start", async (event: any) => {
    if (event?.message?.role === "user") {
      ttftStart = Date.now();
      ttftMs = null;
    }
  });

  pi.on("message_update", async (event: any, ctx: any) => {
    const ev = event?.assistantMessageEvent;
    const type = ev?.type;
    if (
      !streamStart &&
      (type === "text_start" ||
        type === "thinking_start" ||
        type === "toolcall_start")
    ) {
      streamStart = Date.now();
      if (ttftStart) ttftMs = streamStart - ttftStart;
      liveTokens = 0;
    }
    if (
      !streamStart ||
      (type !== "text_delta" &&
        type !== "thinking_delta" &&
        type !== "toolcall_delta")
    ) {
      return;
    }
    liveTokens += estimateTokens(ev?.delta ?? "");
    // Providers that report usage mid-stream beat the estimate.
    const partialOut = ev?.partial?.usage?.output;
    if (typeof partialOut === "number" && partialOut > 0) liveTokens = partialOut;

    const now = Date.now();
    if (now - streamStart < LIVE_MIN_DURATION_MS) return;
    const tps = formatTps(
      liveTokens,
      { durationMs: now - streamStart, ttftMs },
      { colorTps: true, estimate: true },
    );
    if (!tps) return;
    try {
      ctx.ui.setStatus(FOOTER_KEY, tps);
    } catch {
      // footer is best-effort
    }
  });

  pi.on("turn_end", async (event: any, ctx: any) => {
    seedFromFile(ctx);
    const usage: Usage | undefined = event?.message?.usage;
    cum.turns++;
    if (usage) {
      cum.output += usage.output || 0;
      cum.cost += usage.cost?.total || 0;
      cum.lastTokens = usage.totalTokens || cum.lastTokens;
    }
    const model = event?.message?.model;
    if (model) cum.model = model;

    // Close out this stream's timing before any early return; each assistant
    // message (incl. tool-call rounds) gets its own measurement.
    let timing: TurnTiming | undefined;
    if (streamStart) {
      timing = { durationMs: Date.now() - streamStart, ttftMs };
    }
    streamStart = 0;
    ttftMs = null;

    // Footer: paint this turn's exact rate from real usage, or the stream's
    // live estimate when the provider reported no output count. Stays resident,
    // and stays independent of the inline mode: `off` hides the transcript line
    // only.
    const footerTps = formatTps(usage?.output || liveTokens, timing, {
      colorTps: true,
    });
    liveTokens = 0;
    if (footerTps) {
      try {
        ctx.ui.setStatus(FOOTER_KEY, footerTps);
      } catch {
        // footer is best-effort
      }
    }

    // verbose: every message; brief: round end only (no pending tool calls);
    // off: transcript stays clean, totals keep counting for the report.
    if (mode === "off") return;
    if (mode === "brief" && event?.message?.stopReason === "toolUse") return;

    const line = renderStatus(
      cum,
      usage ?? null,
      contextPercent(ctx),
      { plain: true },
      timing,
    );
    if (line) {
      try {
        pi.appendEntry(ENTRY_TYPE, { line });
      } catch {
        // never break the turn over a stats line
      }
    }
  });

  // ---------- commands ----------
  pi.registerCommand("token-summary", {
    description: "Token/cost 报告；参数 verbose|brief|off 切换内联统计行",
    handler: async (args: any, ctx: any) => {
      const arg = typeof args === "string" ? args.trim() : "";
      if (arg) {
        const m = parseMode(arg);
        if (!m) {
          ctx.ui.notify(
            `未知模式 "${arg}"，可用：verbose | brief | off`,
            "warning",
          );
          return;
        }
        mode = m;
        saveMode(m);
        ctx.ui.notify(`统计行：${MODE_LABEL[m]}`, "info");
        return;
      }
      if (!ctx.sessionFile) {
        ctx.ui.notify("No session file yet", "warning");
        return;
      }
      const s = summarizeSessionFile(ctx.sessionFile);
      const report = renderLine(s) || "No usage recorded yet";
      ctx.ui.notify(`${report}\n统计行模式：${MODE_LABEL[mode]}`, "info");
    },
  });
}
