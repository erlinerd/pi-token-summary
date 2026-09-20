// Shared formatting for pi-token-summary.
// summarizeSessionFile parses a pi session .jsonl (assistant lines carry
// message.usage {output, totalTokens, cost.total} and message.model).

import { readFileSync } from "node:fs";

export interface SessionSummary {
  turns: number;
  output: number;
  cost: number;
  lastTokens: number;
  model: string;
}

interface ParsedUsage {
  output?: number;
  totalTokens?: number;
  cost?: { total?: number };
}

export interface Cumulative extends SessionSummary {}

export interface TurnUsage {
  output?: number;
}

export interface RenderStatusOptions {
  /** Join with an unstyled "·" (no ANSI dim) for themed TUI components. */
  plain?: boolean;
}

export function summarizeSessionFile(path: string): SessionSummary {
  let turns = 0;
  let output = 0;
  let cost = 0;
  let lastTokens = 0;
  let model = "";

  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.includes('"usage"')) continue;
    let j: {
      message?: { usage?: ParsedUsage; model?: string };
      usage?: ParsedUsage;
    };
    try {
      j = JSON.parse(line);
    } catch {
      continue;
    }
    const u = j.message?.usage ?? j.usage;
    if (!u) continue;
    turns++;
    output += u.output || 0;
    cost += u.cost?.total || 0;
    lastTokens = u.totalTokens || lastTokens;
    if (j.message?.model) model = j.message.model;
  }

  return { turns, output, cost, lastTokens, model };
}

const k = (n: number): string =>
  n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);
const pct = (v: number | null | undefined): string =>
  typeof v === "number" && Number.isFinite(v) ? Math.round(v) + "%" : "-";
const usd = (v: number): string =>
  "$" + (v >= 0.01 || v === 0 ? v.toFixed(2) : v.toFixed(3));

// One-line footer/status render. turnUsage = current turn's usage (or null).
// opts.plain: join with an unstyled "·" (no ANSI dim) for themed TUI components.
export function renderStatus(
  cum: Cumulative | null,
  turnUsage: TurnUsage | null,
  ctxPct: number | null,
  opts: RenderStatusOptions = {},
): string {
  if (!cum || (!cum.turns && !turnUsage)) return "";
  const parts: string[] = [];
  if (turnUsage && typeof turnUsage.output === "number") {
    parts.push(`↓${k(turnUsage.output)} 本轮`);
  }
  parts.push(`Σ↓${k(cum.output)} tok`);
  parts.push(`ctx ${pct(ctxPct)}`);
  parts.push(usd(cum.cost));
  if (cum.model) parts.push(cum.model);
  return parts.join(opts.plain ? " · " : " \x1b[2m·\x1b[0m ");
}

// Session-end style line (kept for /token-summary and possible CLI use).
export function renderLine(s: SessionSummary | null): string {
  if (!s || s.turns === 0) return "";
  const parts = [
    `会话 ${s.turns} 轮`,
    `输出 ${k(s.output)} tok`,
    `成本 ${usd(s.cost)}`,
    `末轮上下文 ${k(s.lastTokens)} tok`,
  ];
  if (s.model) parts.push(s.model);
  return parts.join(" · ");
}
