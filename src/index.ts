/**
 * pi-exit-summary — per-turn token/cost status line for pi
 *
 * After EVERY agent turn, the footer status shows:
 *   ↓out 本轮 · Σ累计输出 · ctx 占用% · $累计成本
 *
 * Also provides `/exit-summary` for a full in-session summary
 * (parsed from the session file, so it is accurate across resumes).
 */
import { renderStatus, summarizeSessionFile } from "../lib/summarize.mjs";

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

export default function (pi: any) {
  let cum: Cumulative = { turns: 0, output: 0, cost: 0, lastTokens: 0, model: "" };
  let seeded = false;

  function seedFromFile(ctx: any) {
    if (seeded || !ctx.sessionFile) return;
    seeded = true;
    try {
      const s = summarizeSessionFile(ctx.sessionFile);
      cum = { turns: s.turns, output: s.output, cost: s.cost, lastTokens: s.lastTokens, model: s.model };
      if (cum.turns > 0) updateStatus(ctx, null);
    } catch {
      // fresh session without file yet — start from zero
    }
  }

  function updateStatus(ctx: any, turnUsage: Usage | null) {
    let ctxPct: number | null = null;
    try {
      const u = ctx.getContextUsage?.() ?? null;
      if (u && typeof u.percent === "number") ctxPct = u.percent;
      else if (u && typeof u.tokens === "number" && typeof u.contextWindow === "number" && u.contextWindow > 0) {
        ctxPct = (u.tokens / u.contextWindow) * 100;
      }
    } catch {
      // status line must never break the turn
    }
    const line = renderStatus(cum, turnUsage, ctxPct);
    if (line) ctx.ui.setStatus("pi-exit-summary", line);
  }

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
    updateStatus(ctx, usage ?? null);
  });

  pi.registerCommand("exit-summary", {
    description: "Show token/cost summary for the current session",
    handler: async (_args: any, ctx: any) => {
      if (!ctx.sessionFile) {
        ctx.ui.notify("No session file yet", "warning");
        return;
      }
      const line = renderStatus(summarizeSessionFile(ctx.sessionFile), null, null);
      ctx.ui.notify(line || "No usage recorded yet", "info");
    },
  });
}
