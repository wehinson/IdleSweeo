import test from "node:test";
import assert from "node:assert/strict";
import { hydrateSave, serializeSave, validateSave } from "../src/persistence/save-schema.js";
import { parseImportedSave } from "../src/persistence/storage.js";
import { createDeveloperTelemetry, restartDeveloperRun } from "../src/engine/developer-telemetry.js";

function modeState(rows = 3, cols = 3) {
  return {
    board: Array.from({ length: rows * cols }, (_, index) => ({ index, row: Math.floor(index / cols), col: index % cols })),
    settings: { rows, cols, mines: 1 },
    roundElapsedMs: 321,
    recentlyRevealed: [1],
    treasurePopups: [[2, 10]],
  };
}

function gameState() {
  const developerTelemetry = createDeveloperTelemetry();
  restartDeveloperRun(developerTelemetry, { rows: 3, cols: 3, mines: 1 }, 1000);
  return {
    player: {
      coins: 25,
      shovels: 1,
      flags: 2,
      mines: 0,
      shovelUses: 5,
      specialEquipment: {},
      specialists: {},
      contracts: { offeredIds: [], active: null },
    },
    settings: { rows: 3, cols: 3, mines: 1 },
    currentMode: "fieldQueue",
    fieldQueue: modeState(),
    autoMiners: {
      queue: [modeState()],
      workerFields: {},
      initiative: { agents: [], specialists: [] },
      surveyElapsedMs: 500,
      workerElapsedMs: 1000,
    },
    messageBoard: { challenges: [], nextChallengeInMs: 5000 },
    timers: { challengeTickElapsedMs: 0 },
    developerTelemetry,
  };
}

test("save state round-trips as plain JSON", () => {
  const text = serializeSave(gameState(), () => new Date("2026-01-01T00:00:00.000Z"));
  const parsed = JSON.parse(text);
  validateSave(parsed);
  assert.deepEqual(hydrateSave(parsed), gameState());
});

test("save validation rejects malformed boards and future versions", () => {
  const parsed = JSON.parse(serializeSave(gameState()));
  parsed.state.fieldQueue.board.pop();
  assert.throws(() => validateSave(parsed), /board size/);
  parsed.state.fieldQueue = modeState();
  parsed.schemaVersion = 99;
  assert.throws(() => validateSave(parsed), /newer game version/);
});

test("save validation rejects non-JSON values", () => {
  const state = gameState();
  state.player.bad = new Set([1]);
  assert.throws(() => serializeSave(state), /non-JSON value/);
});

test("import rejects corrupted JSON without producing replacement state", () => {
  assert.throws(() => parseImportedSave('{"format":'), SyntaxError);
});

test("save validation rejects unknown catalog identifiers", () => {
  const parsed = JSON.parse(serializeSave(gameState()));
  parsed.state.player.specialEquipment.unknownTool = 1;
  assert.throws(() => validateSave(parsed), /Unknown special equipment id/);
});
