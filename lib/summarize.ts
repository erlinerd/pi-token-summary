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

export interface TurnTiming {
  /** Wall-clock duration of this assistant stream (ms). */
  durationMs?: number;
  /** User message → first streamed content (ms), when known. */
  ttftMs?: number | null;
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

// "TPS: 1600.0 tok/s (641 tok in 4.9s · TTFT: 6282 ms)" — omitted when stream
// timing is missing or degenerate (zero tokens / zero duration).
// opts.colorTps wraps the icon and number with the speed color ramp in
// tpsColor() — dim red when slow, bright emboldened green when fast.
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const hexToAnsi = (hex: string): string => {
  const n = parseInt(hex.slice(1), 16);
  return `\x1b[38;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m`;
};

// Speed color ramp, worst → best. Hue travels red → green and luminance rises
// monotonically, so a dimmer, redder number reads as a slower stream.
// Bands ≥90 also embolden; RESET in the caller clears weight and color alike.
export function tpsColor(tps: number): string {
  if (tps < 10) return hexToAnsi("#A31010");
  if (tps < 30) return hexToAnsi("#E3170D");
  if (tps < 60) return hexToAnsi("#EF7C00");
  if (tps < 90) return hexToAnsi("#B8D430");
  if (tps < 120) return `${BOLD}${hexToAnsi("#7CFC00")}`;
  return `${BOLD}${hexToAnsi("#39FF8E")}`;
}

export function formatTps(
  output: number | undefined,
  timing?: TurnTiming,
  opts?: { colorTps?: boolean },
): string {
  const dur = timing?.durationMs;
  if (!output || !dur || dur <= 0) return "";
  const tps = output / (dur / 1000);
  if (!Number.isFinite(tps) || tps <= 0) return "";
  const rate = opts?.colorTps
    ? `${tpsColor(tps)}⚡${tps.toFixed(1)}${RESET}`
    : `⚡${tps.toFixed(1)}`;
  const ttft =
    typeof timing?.ttftMs === "number" && timing.ttftMs >= 0
      ? ` · TTFT ${Math.round(timing.ttftMs)}ms`
      : "";
  return `${rate} tok/s (${(dur / 1000).toFixed(1)}s${ttft})`;
}

// Rough streaming token count for the footer's mid-stream TPS: CJK chars cost
// ~1 token each, other text ~4 chars per token. Replaced by exact usage at
// turn_end; not labelled as an estimate, the number is transient either way.
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let tokens = 0;
  for (const ch of text) {
    tokens += /[\u3000-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u3040-\u30FF]/.test(ch)
      ? 1
      : 0.25;
  }
  return tokens;
}

// One-line footer/status render. turnUsage = current turn's usage (or null).
// opts.plain: join with an unstyled "·" (no ANSI dim) for themed TUI components.
export function renderStatus(
  cum: Cumulative | null,
  turnUsage: TurnUsage | null,
  ctxPct: number | null,
  opts: RenderStatusOptions = {},
  timing?: TurnTiming,
): string {
  if (!cum || (!cum.turns && !turnUsage)) return "";
  const parts: string[] = [];
  if (turnUsage && typeof turnUsage.output === "number") {
    parts.push(`↓${k(turnUsage.output)} ⟳`);
  }
  const tps = formatTps(turnUsage?.output, timing);
  if (tps) parts.push(tps);
  parts.push(`Σ${k(cum.output)}`);
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
