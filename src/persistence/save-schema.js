import config from "../../config.js";
import { SPECIAL_EQUIPMENT, SPECIALISTS } from "../engine/catalogs.js";

export const SAVE_FORMAT = "idle-sweep-save";
export const SAVE_SCHEMA_VERSION = 1;

export function serializeSave(state, now = () => new Date()) {
  const document = {
    format: SAVE_FORMAT,
    schemaVersion: SAVE_SCHEMA_VERSION,
    exportedAt: now().toISOString(),
    state,
  };
  validateSave(document);
  return JSON.stringify(document, null, 2);
}

export function migrateSave(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error("The selected file is not a save document.");
  }
  if (document.format !== SAVE_FORMAT) throw new Error("This is not an Idle Sweep save file.");
  if (document.schemaVersion > SAVE_SCHEMA_VERSION) throw new Error("This save was created by a newer game version.");
  if (document.schemaVersion !== SAVE_SCHEMA_VERSION) throw new Error("This save version is not supported.");
  return document;
}

export function validateSave(input) {
  const document = migrateSave(input);
  const { state } = document;
  assertPlainObject(state, "state");
  assertPlainObject(state.player, "state.player");
  assertPlainObject(state.settings, "state.settings");
  assertPlainObject(state.messageBoard, "state.messageBoard");
  assertPlainObject(state.timers, "state.timers");
  if (state.developerTelemetry !== undefined) validateDeveloperTelemetry(state.developerTelemetry);
  if (!new Set(["fieldQueue", "autoMiners"]).has(state.currentMode)) throw new Error("The save contains an invalid game mode.");
  validateSettings(state.settings, "state.settings");
  if (state.fieldQueue !== null) validateModeState(state.fieldQueue, "state.fieldQueue");
  if (state.autoMiners !== null) validateAutoMiners(state.autoMiners);
  if (!Array.isArray(state.messageBoard.challenges)) throw new Error("The message board challenge list is invalid.");
  validatePlayer(state.player);
  validateMessageBoard(state.messageBoard);
  assertFiniteNonNegative(state.messageBoard.nextChallengeInMs, "next challenge timer");
  assertJsonValue(state, "state");
  return document;
}

function validateDeveloperTelemetry(telemetry) {
  assertPlainObject(telemetry, "state.developerTelemetry");
  if (telemetry.schemaVersion !== 1) throw new Error("The developer telemetry version is invalid.");
  assertFiniteNonNegative(telemetry.nextRunNumber, "developer telemetry run number");
  if (!Array.isArray(telemetry.completedRuns)) throw new Error("The developer telemetry run list is invalid.");
  telemetry.completedRuns.forEach((run, index) => validateDeveloperRun(run, `state.developerTelemetry.completedRuns[${index}]`));
  if (telemetry.currentRun !== null) validateDeveloperRun(telemetry.currentRun, "state.developerTelemetry.currentRun");
}

function validateDeveloperRun(run, path) {
  assertPlainObject(run, path);
  if (typeof run.id !== "string" || !run.id) throw new Error(`${path}.id is invalid.`);
  if (!new Set(["in_progress", "cleared", "mine_hit", "contract_completed", "abandoned"]).has(run.outcome)) {
    throw new Error(`${path}.outcome is invalid.`);
  }
  assertPlainObject(run.board, `${path}.board`);
  assertPlainObject(run.equipmentUses, `${path}.equipmentUses`);
  assertPlainObject(run.purchases, `${path}.purchases`);
  for (const key of ["runNumber", "startedAtEpochMs", "digActions", "revealCount", "flagPlacements", "flagRemovals", "chordUses", "mineHits", "shovelDurabilityConsumed", "shovelsConsumed", "coinsEarned", "recoveredMinesEarned"]) {
    assertFiniteNonNegative(run[key], `${path}.${key}`);
  }
  for (const key of ["rows", "cols", "mines"]) assertFiniteNonNegative(run.board[key], `${path}.board.${key}`);
  for (const [key, value] of Object.entries(run.equipmentUses)) assertFiniteNonNegative(value, `${path}.equipmentUses.${key}`);
  for (const [key, value] of Object.entries(run.purchases)) assertFiniteNonNegative(value, `${path}.purchases.${key}`);
  for (const key of ["endedAtEpochMs", "durationMs", "contractCompletionTimeMs", "firstPurchaseTimeMs"]) {
    if (run[key] !== null) assertFiniteNonNegative(run[key], `${path}.${key}`);
  }
}

function validatePlayer(player) {
  for (const key of ["coins", "shovels", "flags", "mines", "shovelUses"]) {
    assertFiniteNonNegative(player[key], `player.${key}`);
  }
  assertPlainObject(player.specialEquipment, "player.specialEquipment");
  assertPlainObject(player.specialists, "player.specialists");
  assertPlainObject(player.contracts, "player.contracts");
  const equipmentIds = new Set(SPECIAL_EQUIPMENT.map((item) => item.id));
  const specialistIds = new Set(SPECIALISTS.map((item) => item.id));
  Object.entries(player.specialEquipment).forEach(([id, count]) => {
    if (!equipmentIds.has(id)) throw new Error(`Unknown special equipment id: ${id}`);
    assertFiniteNonNegative(count, `special equipment ${id}`);
  });
  Object.entries(player.specialists).forEach(([id, level]) => {
    if (!specialistIds.has(id)) throw new Error(`Unknown specialist id: ${id}`);
    assertFiniteNonNegative(level, `specialist ${id}`);
  });
  const contractIds = new Set(config.contracts.types.map((item) => item.id));
  const offeredIds = player.contracts.offeredIds || [];
  if (!Array.isArray(offeredIds) || offeredIds.some((id) => !contractIds.has(id))) throw new Error("The save contains an unknown contract offer.");
  if (player.contracts.active?.id && !contractIds.has(player.contracts.active.id)) throw new Error("The save contains an unknown active contract.");
}

function validateMessageBoard(messageBoard) {
  const challengeIds = new Set(config.messageBoard.challenges.types.map((item) => item.id));
  if (messageBoard.challenges.length > config.messageBoard.challenges.maxActive) throw new Error("The message board contains too many challenges.");
  messageBoard.challenges.forEach((challenge) => {
    assertPlainObject(challenge, "challenge");
    if (!challengeIds.has(challenge.type)) throw new Error(`Unknown challenge type: ${challenge.type}`);
    assertFiniteNonNegative(challenge.expiresInMs, "challenge expiry");
  });
}

export function hydrateSave(input) {
  const document = validateSave(migrateSave(input));
  return structuredCloneSafe(document.state);
}

function validateAutoMiners(autoMiners) {
  assertPlainObject(autoMiners, "state.autoMiners");
  if (!Array.isArray(autoMiners.queue) || autoMiners.queue.length > 5) throw new Error("The Auto Miner queue is invalid.");
  autoMiners.queue.forEach((field, index) => validateModeState(field, `state.autoMiners.queue[${index}]`));
  assertPlainObject(autoMiners.workerFields, "state.autoMiners.workerFields");
  assertPlainObject(autoMiners.initiative, "state.autoMiners.initiative");
  const specialistIds = new Set(SPECIALISTS.map((item) => item.id));
  Object.entries(autoMiners.workerFields).forEach(([id, fieldIndex]) => {
    if (!specialistIds.has(id)) throw new Error(`Unknown Auto Miner specialist id: ${id}`);
    assertFiniteNonNegative(fieldIndex, `Auto Miner field index for ${id}`);
  });
  for (const group of ["agents", "specialists"]) {
    if (!Array.isArray(autoMiners.initiative[group]) || autoMiners.initiative[group].some((id) => !specialistIds.has(id))) {
      throw new Error(`The Auto Miner ${group} initiative is invalid.`);
    }
  }
  assertFiniteNonNegative(autoMiners.surveyElapsedMs, "Surveyor timer");
  assertFiniteNonNegative(autoMiners.workerElapsedMs, "worker timer");
}

function validateModeState(mode, path) {
  assertPlainObject(mode, path);
  validateSettings(mode.settings, `${path}.settings`);
  if (!Array.isArray(mode.board) || mode.board.length !== mode.settings.rows * mode.settings.cols) {
    throw new Error(`${path} has an invalid board size.`);
  }
  mode.board.forEach((cell, index) => {
    assertPlainObject(cell, `${path}.board[${index}]`);
    if (cell.index !== index) throw new Error(`${path} has invalid cell indexes.`);
  });
  assertFiniteNonNegative(mode.roundElapsedMs, `${path}.roundElapsedMs`);
  if (!Array.isArray(mode.recentlyRevealed) || !Array.isArray(mode.treasurePopups)) {
    throw new Error(`${path} contains invalid transient collections.`);
  }
  const equipmentIds = new Set(SPECIAL_EQUIPMENT.map((item) => item.id));
  if (mode.selectedEquipmentId !== null && mode.selectedEquipmentId !== undefined && !equipmentIds.has(mode.selectedEquipmentId)) {
    throw new Error(`${path} contains an unknown selected equipment id.`);
  }
}

function validateSettings(settings, path) {
  for (const key of ["rows", "cols", "mines"]) {
    if (!Number.isInteger(settings[key]) || settings[key] < 0) throw new Error(`${path}.${key} is invalid.`);
  }
  if (settings.rows < 1 || settings.cols < 1 || settings.mines > settings.rows * settings.cols) {
    throw new Error(`${path} contains impossible board dimensions.`);
  }
}

function assertPlainObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object.`);
}

function assertFiniteNonNegative(value, name) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative number.`);
}

function assertJsonValue(value, path) {
  if (value === null || ["string", "boolean"].includes(typeof value)) return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${path} contains a non-finite number.`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonValue(item, `${path}[${index}]`));
    return;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${path} contains a non-JSON value.`);
  Object.entries(value).forEach(([key, item]) => assertJsonValue(item, `${path}.${key}`));
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}
