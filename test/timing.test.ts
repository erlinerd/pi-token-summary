// Regression test for per-round TTFT. Drives the extension with a synthetic
// pi event stream and reads the footer status entry it paints.
//
// Bug fixed: the TTFT clock reset only on the user message, so in a turn with
// tool calls every later round measured from the start of the whole turn and
// the number kept growing. It must reset on each new assistant request, which
// pi marks with a toolResult message_start.
import { test } from "node:test";
import assert from "node:assert/strict";
import register from "../src/index";

type Handler = (event: any, ctx: any) => Promise<any>;

function harness() {
  const handlers: Record<string, Handler> = {};
  const footer: string[] = [];
  const ctx = {
    sessionFile: "",
    getContextUsage: () => ({ percent: 40 }),
    ui: {
      setStatus: (_key: string, text: string | undefined) => {
        if (text) footer.push(text);
      },
      notify: () => {},
    },
  };
  const pi: any = {
    on: (name: string, fn: Handler) => (handlers[name] = fn),
    registerCommand: () => {},
    registerEntryRenderer: () => {},
    appendEntry: () => {},
  };
  register(pi);
  return { handlers, footer, ctx };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ttftOf = (line: string) =>
  Number(/TTFT\s+(\d+)ms/.exec(line)?.[1] ?? -1);
const plain = (line: string) => line.replace(/\x1b\[[0-9;]*m/g, "");

// One assistant round: request starts on `role`, waits `latencyMs` for the
// first content, then streams for a bit longer than the live-TPS floor.
async function round(
  h: ReturnType<typeof harness>,
  role: "user" | "toolResult",
  latencyMs: number,
) {
  await h.handlers.message_start({ message: { role } }, h.ctx);
  await sleep(latencyMs);
  await h.handlers.message_update(
    { assistantMessageEvent: { type: "text_start" } },
    h.ctx,
  );
  await sleep(140);
  await h.handlers.message_update(
    {
      assistantMessageEvent: {
        type: "text_delta",
        delta: "流式中文内容测试样本 ",
        partial: {},
      },
    },
    h.ctx,
  );
  await h.handlers.turn_end(
    {
      message: {
        usage: { output: 120, totalTokens: 9000, cost: { total: 0.01 } },
        model: "glm-5.3-flash",
        stopReason: role === "user" ? "toolUse" : "stop",
      },
    },
    h.ctx,
  );
}

test("TTFT measures each assistant round, not the whole turn", async () => {
  const h = harness();
  await h.handlers.session_start({}, h.ctx);

  await round(h, "user", 220);
  const first = ttftOf(h.footer.at(-1)!);
  assert.ok(first >= 200 && first <= 400, `round 1 TTFT ${first}ms`);

  // A short wait here is the whole point: if the clock did not reset, TTFT
  // would still include round 1's latency and stream time (400ms+).
  const before = h.footer.length;
  await round(h, "toolResult", 40);
  assert.ok(h.footer.length > before, "round 2 must repaint the footer");
  const second = ttftOf(h.footer.at(-1)!);
  assert.ok(second >= 0 && second < 150, `round 2 TTFT ${second}ms looks cumulative`);
});

test("footer line format: icon, rate, unit, elapsed, TTFT", async () => {
  const h = harness();
  await h.handlers.session_start({}, h.ctx);
  await round(h, "user", 60);
  const line = plain(h.footer.at(-1)!);
  // footer is fixed-width: numeric fields carry leading pad spaces
  assert.match(line, /^⚡\s*[\d.]+ tok\/s \(\s*[\d.]+s · TTFT\s+[\d]+ms\)$/);
  assert.ok(!line.includes("live"), `final value must not be tagged live: ${line}`);
});
