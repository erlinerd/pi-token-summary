import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  estimateTokens,
  formatTps,
  tpsColor,
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
  assert.match(line, /⚡130\.8 tok\/s \(4\.9s · TTFT 6282ms\)/);
  assert.ok(line.indexOf("⟳") < line.indexOf("⚡"));
  assert.ok(line.indexOf("⚡") < line.indexOf("Σ"));
});

test("formatTps omits TTFT when unknown, drops segment when degenerate", () => {
  assert.equal(
    formatTps(641, { durationMs: 4900 }),
    "⚡130.8 tok/s (4.9s)",
  );
  // no duration / zero duration / zero output → no segment
  assert.equal(formatTps(641, {}), "");
  assert.equal(formatTps(641, { durationMs: 0 }), "");
  assert.equal(formatTps(0, { durationMs: 4900 }), "");
  assert.equal(formatTps(undefined, { durationMs: 4900 }), "");
  // negative TTFT is untrustworthy → dropped, TPS kept
  assert.equal(
    formatTps(641, { durationMs: 4900, ttftMs: -5 }),
    "⚡130.8 tok/s (4.9s)",
  );
});

test("formatTps fixedWidth: constant width, TTFT segment always present", () => {
  const width = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "").length;
  // small + large values must occupy identical width
  const small = formatTps(
    31,
    { durationMs: 10000, ttftMs: 6282 },
    { fixedWidth: true },
  );
  const large = formatTps(
    6410,
    { durationMs: 49000, ttftMs: 118 },
    { fixedWidth: true },
  );
  assert.match(small, /⚡   3\.1 tok\/s \( 10\.0s · TTFT  6282ms\)/);
  assert.match(large, /⚡ ?130\.8 tok\/s \( 49\.0s · TTFT   118ms\)/);
  assert.equal(width(small), width(large));
  // unknown TTFT keeps the segment with a placeholder, same width
  const noTtft = formatTps(641, { durationMs: 4900 }, { fixedWidth: true });
  assert.match(noTtft, /· TTFT    --ms/);
  assert.equal(width(noTtft), width(small));
  // negative ttft treated as unknown
  const negTtft = formatTps(
    641,
    { durationMs: 4900, ttftMs: -5 },
    { fixedWidth: true },
  );
  assert.equal(width(negTtft), width(small));
  // colorTps composes: color codes add no width
  const colored = formatTps(
    31,
    { durationMs: 10000, ttftMs: 6282 },
    { colorTps: true, fixedWidth: true },
  );
  assert.ok(colored.startsWith(`${tpsColor(3.1)}⚡   3.1\x1b[0m tok/s`), colored);
  assert.equal(width(colored), width(small));
  // degenerate inputs still drop the segment entirely
  assert.equal(formatTps(0, { durationMs: 4900 }, { fixedWidth: true }), "");
});

test("estimateTokens: CJK ≈1 tok/char, latin ≈4 chars/tok", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("你好世界"), 4);
  assert.equal(estimateTokens("abcd"), 1);
  assert.equal(estimateTokens("你好 abcd"), 3.25);
});

test("formatTps colorTps colors the icon and number by speed band", () => {
  const line = formatTps(641, { durationMs: 4900 }, { colorTps: true });
  assert.ok(
    line.startsWith(`${tpsColor(130.8)}⚡130.8\x1b[0m tok/s (4.9s)`),
    line,
  );
  // ramp: 6 bands at 10/30/60/90/120, ≥90 emboldened
  assert.equal(tpsColor(5), "\x1b[38;2;163;16;16m");
  assert.equal(tpsColor(20), "\x1b[38;2;227;23;13m");
  assert.equal(tpsColor(45), "\x1b[38;2;239;124;0m");
  assert.equal(tpsColor(75), "\x1b[38;2;184;212;48m");
  assert.equal(tpsColor(103), "\x1b[1m\x1b[38;2;124;252;0m");
  assert.equal(tpsColor(138), "\x1b[1m\x1b[38;2;57;255;142m");
  // band membership: equal within, different across boundaries
  assert.equal(tpsColor(9.9), tpsColor(0.1));
  assert.notEqual(tpsColor(9.9), tpsColor(10));
  assert.notEqual(tpsColor(29.9), tpsColor(30));
  assert.notEqual(tpsColor(59.9), tpsColor(60));
  assert.notEqual(tpsColor(89.9), tpsColor(90));
  assert.notEqual(tpsColor(119.9), tpsColor(120));
  // non-colored path stays ANSI-free
  assert.ok(!formatTps(641, { durationMs: 4900 }).includes("\x1b["));
});
