import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  formatTps,
  renderLine,
  renderStatus,
  summarizeSessionFile,
} from "../lib/summarize";

function fixture(lines: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "pi-token-summary-"));
  const p = join(dir, "session.jsonl");
  writeFileSync(p, lines.join("\n") + "\n");
  return p;
}

const usage = (
  out: number,
  cost: number,
  total: number,
  model: string,
): string =>
  JSON.stringify({
    type: "message",
    message: {
      model,
      usage: { output: out, totalTokens: total, cost: { total: cost } },
    },
  });

test("sums usage across entries, keeps last totalTokens/model", () => {
  const p = fixture([
    '{"type":"other","foo":1}',
    usage(100, 0.01, 5000, "glm-5.3-flash"),
    "not json at all",
    usage(250, 0.02, 62000, "glm-5.3-flash"),
    '{"type":"message","message":{"role":"user"}}',
  ]);
  const s = summarizeSessionFile(p);
  assert.equal(s.turns, 2);
  assert.equal(s.output, 350);
  assert.ok(Math.abs(s.cost - 0.03) < 1e-9);
  assert.equal(s.lastTokens, 62000);
  assert.equal(s.model, "glm-5.3-flash");
});

test("empty / no-usage file yields zero turns and no line", () => {
  const p = fixture(['{"type":"other"}', ""]);
  const s = summarizeSessionFile(p);
  assert.equal(s.turns, 0);
  assert.equal(renderLine(s), "");
});

test("renderLine formats k tokens and cost", () => {
  const line = renderLine({
    turns: 3,
    output: 20500,
    cost: 0.114,
    lastTokens: 62800,
    model: "m",
  });
  assert.match(line, /3 轮/);
  assert.match(line, /20\.5k tok/);
  assert.match(line, /\$0\.11/);
  assert.match(line, /62\.8k tok/);
});

test("renderStatus shows per-turn + cumulative + ctx + cost", () => {
  const line = renderStatus(
    {
      turns: 5,
      output: 20500,
      cost: 0.114,
      lastTokens: 62800,
      model: "glm-5.3-flash",
    },
    { output: 1200 },
    63.4,
  );
  assert.match(line, /↓1\.2k ⟳/);
  assert.match(line, /Σ20\.5k/);
  assert.match(line, /ctx 63%/);
  assert.match(line, /\$0\.11/);
  assert.match(line, /glm-5\.3-flash/);
});

test("renderStatus empty state returns empty string", () => {
  assert.equal(
    renderStatus(
      { turns: 0, output: 0, cost: 0, lastTokens: 0, model: "" },
      null,
      null,
    ),
    "",
  );
});

test("renderStatus plain mode: unstyled separator, no ANSI codes", () => {
  const cum = {
    turns: 5,
    output: 20500,
    cost: 0.114,
    lastTokens: 62800,
    model: "glm-5.3-flash",
  };
  const plain = renderStatus(cum, { output: 1200 }, 63.4, { plain: true });
  assert.match(plain, /↓1\.2k ⟳/);
  assert.match(plain, /Σ20\.5k/);
  assert.match(plain, / · /);
  assert.doesNotMatch(plain, /\x1b\[/);

  const styled = renderStatus(cum, null, null);
  assert.match(styled, /\x1b\[2m/);
});

test("renderStatus with timing: TPS segment after ⟳, before Σ", () => {
  const line = renderStatus(
    {
      turns: 5,
      output: 20500,
      cost: 0.114,
      lastTokens: 62800,
      model: "glm-5.3-flash",
    },
    { output: 641 },
    27,
    { plain: true },
    { durationMs: 4900, ttftMs: 6282 },
  );
  // 641 tok / 4.9s = 130.8 tok/s
  assert.match(line, /⚡130\.8 t\/s \(4\.9s · TTFT 6282ms\)/);
  assert.ok(line.indexOf("⟳") < line.indexOf("⚡"));
  assert.ok(line.indexOf("⚡") < line.indexOf("Σ"));
});

test("formatTps omits TTFT when unknown, drops segment when degenerate", () => {
  assert.equal(
    formatTps(641, { durationMs: 4900 }),
    "⚡130.8 t/s (4.9s)",
  );
  // no duration / zero duration / zero output → no segment
  assert.equal(formatTps(641, {}), "");
  assert.equal(formatTps(641, { durationMs: 0 }), "");
  assert.equal(formatTps(0, { durationMs: 4900 }), "");
  assert.equal(formatTps(undefined, { durationMs: 4900 }), "");
  // negative TTFT is untrustworthy → dropped, TPS kept
  assert.equal(
    formatTps(641, { durationMs: 4900, ttftMs: -5 }),
    "⚡130.8 t/s (4.9s)",
  );
});
