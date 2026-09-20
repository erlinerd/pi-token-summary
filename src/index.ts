/**
 * pi-token-summary — token/cost stats for pi.
 *
 * INLINE: after agent turns, a dim stats line is appended to the transcript:
 *      ↓1.2k 本轮 · Σ↓20.5k tok · ctx 63% · $0.11 · glm-5.3-flash
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
 */
import { Text } from "@earendil-works/pi-tui";
import {
  renderLine,
  renderStatus,
  summarizeSessionFile,
} from "../lib/summarize";
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
const LEGACY_ENTRY_TYPE = "exit-summary-turn"; // pre-rename sessions
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

  // ---------- inline transcript line ----------
  const renderEntry = (entry: any, _opts: any, theme: any) => {
    const line: string | undefined = entry?.data?.line;
    return new Text(line ? theme.fg("dim", line) : "");
  };
  pi.registerEntryRenderer(ENTRY_TYPE, renderEntry);
  pi.registerEntryRenderer(LEGACY_ENTRY_TYPE, renderEntry);

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

    // verbose: every message; brief: round end only (no pending tool calls);
    // off: transcript stays clean, totals keep counting for the report.
    if (mode === "off") return;
    if (mode === "brief" && event?.message?.stopReason === "toolUse") return;

    const line = renderStatus(cum, usage ?? null, contextPercent(ctx), {
      plain: true,
    });
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
