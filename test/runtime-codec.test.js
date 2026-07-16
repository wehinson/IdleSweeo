import test from "node:test";
import assert from "node:assert/strict";
import { decodeModeState, encodeModeState } from "../src/persistence/runtime-codec.js";

test("active rounds resume with frozen elapsed time and restored collections", () => {
  const runtime = {
    board: [{ index: 0 }],
    settings: { rows: 1, cols: 1, mines: 0 },
    roundStarted: true,
    roundStartTime: 1000,
    recentlyRevealed: new Set([0]),
    treasurePopups: new Map([[0, 12]]),
    statusText: "Sweeping",
    resetText: "AGAIN",
  };
  const encoded = encodeModeState(runtime, 4500);
  const decoded = decodeModeState(JSON.parse(JSON.stringify(encoded)), 20000);
  assert.equal(encoded.roundElapsedMs, 3500);
  assert.equal(decoded.roundStartTime, 16500);
  assert.deepEqual([...decoded.recentlyRevealed], [0]);
  assert.deepEqual([...decoded.treasurePopups], [[0, 12]]);
  assert.equal(decoded.statusText, "Sweeping");
});
