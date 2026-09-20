import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  renderLine,
  renderStatus,
  summarizeSessionFile,
} from "../lib/summarize.mjs";

function fixture(lines) {
  const dir = mkdtempSync(join(tmpdir(), "pi-token-summary-"));
  const p = join(dir, "session.jsonl");
  writeFileSync(p, lines.join("\n") + "\n");
  return p;
}

const usage = (out, cost, total, model) =>
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
  assert.match(line, /↓1\.2k 本轮/);
  assert.match(line, /Σ↓20\.5k tok/);
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
  assert.match(plain, /↓1\.2k 本轮/);
  assert.match(plain, / · /);
  assert.doesNotMatch(plain, /\x1b\[/);

  const styled = renderStatus(cum, null, null);
  assert.match(styled, /\x1b\[2m/);
});
