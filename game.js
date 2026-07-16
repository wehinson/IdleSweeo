import GAME_CONFIG from "./config.js";
import { createGame } from "./src/engine/game-engine.js";
import { createBoardCells, getNeighbors, hasClearedBoard, updateBoardAdjacency } from "./src/engine/board.js";
import { GAME_MODES, SPECIAL_EQUIPMENT, SPECIAL_EQUIPMENT_BY_ID, SPECIALISTS } from "./src/engine/catalogs.js";
import {
  clamp as clampValue,
  exponentialCost as calculateExponentialCost,
  formatCurrency as formatCurrencyValue,
  randomInteger as chooseRandomInteger,
} from "./src/engine/economy.js";
import {
  breakCurrentShovelState,
  calculateRoundPayout,
  consumeShovelState,
  evaluateChord,
  revealWaves as calculateRevealWaves,
  selectMineIndexes,
} from "./src/engine/round-engine.js";
import { advanceChallengeTimers, challengeMatchesClear as matchesChallengeClear } from "./src/engine/challenges.js";
import {
  contractDigRequirement as calculateContractDigRequirement,
  findContractType,
  listAvailableContracts,
  tickContractCooldowns as decreaseContractCooldowns,
} from "./src/engine/contracts.js";
import {
  createAutoMinerState,
  surveyorIntervalMs as calculateSurveyorIntervalMs,
  workerCost as calculateWorkerCost,
} from "./src/engine/auto-miners.js";
import {
  createStartingSpecialEquipment as createEquipmentInventory,
  createStartingSpecialists as createSpecialistLevels,
  createStartingStats as createEmptyStats,
} from "./src/engine/player.js";
import {
  createDeveloperTelemetry,
  hydrateDeveloperTelemetry,
  recordDeveloperEvent,
  resolveDeveloperRun,
  restartDeveloperRun,
  summarizeDeveloperTelemetry,
} from "./src/engine/developer-telemetry.js";
import {
  clearStoredSaves,
  loadStoredSave,
  readLegacyMessageBoard,
  storeSave,
} from "./src/persistence/storage.js";
import { decodeModeState, encodeModeState } from "./src/persistence/runtime-codec.js";
import { bindSaveControls } from "./src/ui/save-controls.js";
import { createCellInputController } from "./src/ui/board-input.js";
import { renderCurioLedger, renderStatsLedger } from "./src/ui/ledger-view.js";

const BALANCE_CONFIG = GAME_CONFIG;
const GRID_LIMITS = GAME_CONFIG.gridLimits;
const PROGRESSION_CONFIG = GAME_CONFIG.progression;
const MESSAGE_CONFIG = GAME_CONFIG.messages;
const COPY_CONFIG = GAME_CONFIG.copy;
const CONTRACT_CONFIG = GAME_CONFIG.contracts;
const MESSAGE_BOARD_CONFIG = GAME_CONFIG.messageBoard;
const CHALLENGE_CONFIG = MESSAGE_BOARD_CONFIG.challenges;
const DEFAULT_SETTINGS = {
  rows: GRID_LIMITS.min,
  cols: GRID_LIMITS.min,
  mines: 1,
};

function formatMessage(key, values = {}) {
  const template = MESSAGE_CONFIG[key] || key;
  return template.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? "");
}

function formatCopy(template, values = {}) {
  return template.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? "");
}

const boardElement = document.querySelector("#board");
const mineCountElement = document.querySelector("#mine-count");
const moveCountElement = document.querySelector("#move-count");
const statusElement = document.querySelector("#status");
const resetButton = document.querySelector("#reset");
const rowsInput = document.querySelector("#rows-input");
const colsInput = document.querySelector("#cols-input");
const minesInput = document.querySelector("#mines-input");
const settingsNote = document.querySelector("#settings-note");
const coinCountElement = document.querySelector("#coin-count");
const shovelCountElement = document.querySelector("#shovel-count");
const shovelUsesElement = document.querySelector("#shovel-uses");
const shovelResourceElement = document.querySelector("#shovel-resource");
const flagStockElement = document.querySelector("#flag-stock");
const flagCapacityElement = document.querySelector("#flag-capacity");
const flagResourceElement = document.querySelector("#flag-resource");
const mineResourceElement = document.querySelector("#mine-resource");
const activeMineCountElement = document.querySelector("#active-mine-count");
const mineResourceDetailElement = document.querySelector("#mine-resource-detail");
const buyShovelButton = document.querySelector("#buy-shovel");
const buyShovelDetailElement = document.querySelector("#buy-shovel-detail");
const buyShovelCostElement = document.querySelector("#buy-shovel-cost");
const buyFlagsButton = document.querySelector("#buy-flags");
const buyFlagsCostElement = document.querySelector("#buy-flags-cost");
const storeNoteElement = document.querySelector("#store-note");
const statsGridElement = document.querySelector("#stats-grid");
const fastestConfigsElement = document.querySelector("#fastest-configs");
const developerStatsGridElement = document.querySelector("#developer-stats-grid");
const developerStatsNoteElement = document.querySelector("#developer-stats-note");
const resetProgressButton = document.querySelector("#reset-progress");
const curioChanceElement = document.querySelector("#curio-chance");
const curioGridElement = document.querySelector("#curio-grid");
const curioNoteElement = document.querySelector("#curio-note");
const contractCountdownElement = document.querySelector("#contract-countdown");
const challengeCountdownElement = document.querySelector("#challenge-countdown");
const surveyorCountdownElement = document.querySelector("#surveyor-countdown");
const messageBoardListElement = document.querySelector("#message-board-list");
const generateContractButton = document.querySelector("#generate-contract");
const generateChallengeButton = document.querySelector("#generate-challenge");
const surveyNowButton = document.querySelector("#survey-now");
const contractModalElement = document.querySelector("#contract-modal");
const contractModalLabelElement = document.querySelector("#contract-modal-label");
const contractModalTitleElement = document.querySelector("#contract-modal-title");
const contractModalDescriptionElement = document.querySelector("#contract-modal-description");
const contractModalFieldElement = document.querySelector("#contract-modal-field");
const contractModalMinesElement = document.querySelector("#contract-modal-mines");
const contractModalRewardElement = document.querySelector("#contract-modal-reward");
const contractModalDigsElement = document.querySelector("#contract-modal-digs");
const contractModalFlagsElement = document.querySelector("#contract-modal-flags");
const contractModalStartButton = document.querySelector("#contract-modal-start");
const fieldClearModalElement = document.querySelector("#field-clear-modal");
const fieldClearModalDescriptionElement = document.querySelector("#field-clear-modal-description");
const fieldClearModalDismissButton = document.querySelector("#field-clear-modal-dismiss");
const specialEquipmentStoreElement = document.querySelector("#special-equipment-store");
const specialEquipmentListElement = document.querySelector("#special-equipment-list");
const equipmentToggleButton = document.querySelector("#equipment-toggle");
const equipmentTotalElement = document.querySelector("#equipment-total");
const equipmentInventoryElement = document.querySelector("#equipment-inventory");
const equipmentInventoryListElement = document.querySelector("#equipment-inventory-list");
const fieldQueueButton = document.querySelector("#field-queue-button");
const autoMinersButton = document.querySelector("#auto-miners-button");
const quartermasterPanelElement = document.querySelector("#quartermaster-panel");
const specialistsPanelElement = document.querySelector("#specialists-panel");
const autoMineFieldElement = document.querySelector("#auto-mine-field");
const surveyorCardElement = document.querySelector("#surveyor-card");
const agentListElement = document.querySelector("#agent-list");
const specialistListElement = document.querySelector("#specialist-list");
const specialistNoteElement = document.querySelector("#specialist-note");
const boardInputController = createCellInputController();

let autoQueueView = false;

const upgradeElements = {
  tallerGrid: document.querySelector("#taller-grid"),
  tallerGridTitle: document.querySelector("#taller-grid-title"),
  tallerGridDetail: document.querySelector("#taller-grid-detail"),
  tallerGridCost: document.querySelector("#taller-grid-cost"),
  widerGrid: document.querySelector("#wider-grid"),
  widerGridTitle: document.querySelector("#wider-grid-title"),
  widerGridDetail: document.querySelector("#wider-grid-detail"),
  widerGridCost: document.querySelector("#wider-grid-cost"),
  improveShovel: document.querySelector("#improve-shovel"),
  upgradeTitle: document.querySelector("#upgrade-title"),
  upgradeDetail: document.querySelector("#upgrade-detail"),
  upgradeCost: document.querySelector("#upgrade-cost"),
  addMine: document.querySelector("#add-mine"),
  addMineDetail: document.querySelector("#add-mine-detail"),
  addMineCost: document.querySelector("#add-mine-cost"),
  addTreasure: document.querySelector("#add-treasure"),
  addTreasureDetail: document.querySelector("#add-treasure-detail"),
  addTreasureCost: document.querySelector("#add-treasure-cost"),
  treasureValue: document.querySelector("#treasure-value"),
  treasureValueDetail: document.querySelector("#treasure-value-detail"),
  treasureValueCost: document.querySelector("#treasure-value-cost"),
  betterFlags: document.querySelector("#better-flags"),
  betterFlagsDetail: document.querySelector("#better-flags-detail"),
  betterFlagsCost: document.querySelector("#better-flags-cost"),
  mineYield: document.querySelector("#mine-yield"),
  mineYieldDetail: document.querySelector("#mine-yield-detail"),
  mineYieldCost: document.querySelector("#mine-yield-cost"),
  shovelCap: document.querySelector("#shovel-cap"),
  shovelCapDetail: document.querySelector("#shovel-cap-detail"),
  shovelCapCost: document.querySelector("#shovel-cap-cost"),
  flagCap: document.querySelector("#flag-cap"),
  shovelCapTitle: document.querySelector("#shovel-cap-title"),
  flagCapTitle: document.querySelector("#flag-cap-title"),
  flagCapDetail: document.querySelector("#flag-cap-detail"),
  flagCapCost: document.querySelector("#flag-cap-cost"),
};

const abilityElements = {
  safetyRadius: document.querySelector("#safety-radius"),
  safetyRadiusDetail: document.querySelector("#safety-radius-detail"),
  safetyRadiusCost: document.querySelector("#safety-radius-cost"),
  chording: document.querySelector("#chording"),
  chordingTitle: document.querySelector("#chording-title"),
  chordingDetail: document.querySelector("#chording-detail"),
  chordingCost: document.querySelector("#chording-cost"),
};

let board = [];
let settings = { ...DEFAULT_SETTINGS };
let gameOver = false;
let roundStarted = false;
let roundStartTime = 0;
let moves = 0;
let flagsPlaced = 0;
let minesPlaced = false;
let isRevealing = false;
let revealToken = 0;
let recentlyRevealed = new Set();
let treasurePopups = new Map();
let emergencyHandoutNotice = false;
let emergencyHandoutStatus = "";
let roundTreasureValue = 0;
let roundTreasureCount = 0;
let roundFlagPlacements = 0;
let roundUsedChording = false;
let roundResolved = false;
let selectedEquipmentId = null;
let activeEquipment = createRoundEquipmentState();
let lastChallengeTickTime = performance.now();
let player = createStartingPlayer();
let currentMode = GAME_MODES.fieldQueue;
let fieldQueueState = null;
let autoMinersState = null;
let developerTelemetry = createDeveloperTelemetry();
const stateEngine = createGame({
  config: GAME_CONFIG,
  initialState: null,
  clock: () => performance.now(),
  rng: () => Math.random(),
  reducer: reduceRuntimeAction,
});
let saveReady = false;
let autosaveTimer = null;

function createStartingPlayer() {
  const durability = BALANCE_CONFIG.shovel.tiers[0].durability;

  return {
    coins: BALANCE_CONFIG.startingCoins,
    shovels: BALANCE_CONFIG.startingShovels,
    flags: BALANCE_CONFIG.startingFlags,
    mines: BALANCE_CONFIG.startingMines,
    shovelTier: 0,
    shovelUses: BALANCE_CONFIG.startingShovels * durability,
    shovelCapacityLevel: 0,
    flagCapacityLevel: 0,
    mineLevel: 0,
    treasureLevel: 0,
    treasureValueLevel: 0,
    betterFlagsLevel: 0,
    mineYieldLevel: 0,
    tallerGridLevel: 0,
    widerGridLevel: 0,
    safetyRadius: 0,
    chordingUnlocked: false,
    specialEquipmentUnlocked: false,
    specialEquipment: createStartingSpecialEquipment(),
    specialists: createStartingSpecialists(),
    emergencyShovelUsed: false,
    curioMisses: 0,
    curios: Array.from({ length: BALANCE_CONFIG.curio.itemCount }, () => 0),
    contracts: createStartingContracts(),
    messageBoard: createStartingMessageBoard(),
    stats: createStartingStats(),
  };
}

function createStartingSpecialists() {
  return createSpecialistLevels(SPECIALISTS);
}

function createStartingSpecialEquipment() {
  return createEquipmentInventory(SPECIAL_EQUIPMENT);
}

function createRoundEquipmentState() {
  return {
    bombBotUses: 0,
    mineEncapsulationUses: 0,
  };
}

function createModeState() {
  return {
    board: board.map((cell) => ({ ...cell })),
    settings: { ...settings },
    gameOver,
    roundStarted,
    roundStartTime,
    roundResolved,
    moves,
    flagsPlaced,
    minesPlaced,
    isRevealing: false,
    revealToken,
    recentlyRevealed: new Set(recentlyRevealed),
    treasurePopups: new Map(treasurePopups),
    roundTreasureValue,
    roundTreasureCount,
    roundFlagPlacements,
    roundUsedChording,
    selectedEquipmentId,
    activeEquipment: { ...activeEquipment },
    statusText: statusElement.textContent,
    resetText: resetButton.textContent,
    running: false,
    lastActionAt: 0,
  };
}

function loadModeState(state) {
  board = state.board.map((cell) => ({ ...cell }));
  settings = { ...state.settings };
  gameOver = state.gameOver;
  roundStarted = state.roundStarted;
  roundStartTime = state.roundStartTime;
  roundResolved = state.roundResolved;
  moves = state.moves;
  flagsPlaced = state.flagsPlaced;
  minesPlaced = state.minesPlaced;
  isRevealing = false;
  revealToken = state.revealToken;
  recentlyRevealed = new Set(state.recentlyRevealed);
  treasurePopups = new Map(state.treasurePopups);
  roundTreasureValue = state.roundTreasureValue;
  roundTreasureCount = state.roundTreasureCount;
  roundFlagPlacements = state.roundFlagPlacements;
  roundUsedChording = state.roundUsedChording;
  selectedEquipmentId = state.selectedEquipmentId;
  activeEquipment = { ...state.activeEquipment };
  statusElement.textContent = state.statusText;
  resetButton.textContent = state.resetText;
}

function saveCurrentModeState() {
  if (currentMode === GAME_MODES.autoMiners) {
    saveAutoActiveField();
    return;
  }

  fieldQueueState = createModeState();
}

function captureGameState() {
  const now = performance.now();
  saveCurrentModeState();
  const savedPlayer = JSON.parse(JSON.stringify(player));
  delete savedPlayer.messageBoard;
  const savedAutoMiners = autoMinersState
    ? {
        ...JSON.parse(JSON.stringify(autoMinersState)),
        queue: autoMinersState.queue.map((field) => encodeModeState(field, now)),
        surveyElapsedMs: Math.max(0, now - autoMinersState.lastSurveyAt),
        workerElapsedMs: autoMinersState.lastWorkerTickAt > 0
          ? Math.max(0, now - autoMinersState.lastWorkerTickAt)
          : 1000,
        notice: { code: "literal", args: { text: autoMinersState.statusText || "" } },
      }
    : null;
  if (savedAutoMiners) {
    delete savedAutoMiners.lastSurveyAt;
    delete savedAutoMiners.lastWorkerTickAt;
    delete savedAutoMiners.statusText;
  }

  return {
    player: savedPlayer,
    settings: { ...settings },
    currentMode,
    fieldQueue: encodeModeState(fieldQueueState, now),
    autoMiners: savedAutoMiners,
    messageBoard: JSON.parse(JSON.stringify(player.messageBoard)),
    timers: {
      challengeTickElapsedMs: Math.max(0, now - lastChallengeTickTime),
    },
    developerTelemetry: JSON.parse(JSON.stringify(developerTelemetry)),
  };
}

function replaceGameState(savedState) {
  const now = performance.now();
  const defaults = createStartingPlayer();
  player = {
    ...defaults,
    ...savedState.player,
    specialEquipment: { ...defaults.specialEquipment, ...savedState.player.specialEquipment },
    specialists: { ...defaults.specialists, ...savedState.player.specialists },
    contracts: { ...defaults.contracts, ...savedState.player.contracts },
    stats: { ...defaults.stats, ...savedState.player.stats },
    messageBoard: JSON.parse(JSON.stringify(savedState.messageBoard)),
  };
  settings = { ...savedState.settings };
  developerTelemetry = hydrateDeveloperTelemetry(savedState.developerTelemetry);
  currentMode = savedState.currentMode;
  fieldQueueState = decodeModeState(savedState.fieldQueue, now);
  autoMinersState = savedState.autoMiners
    ? {
        ...savedState.autoMiners,
        queue: savedState.autoMiners.queue.map((field) => decodeModeState(field, now)),
        lastSurveyAt: now - savedState.autoMiners.surveyElapsedMs,
        lastWorkerTickAt: now - savedState.autoMiners.workerElapsedMs,
        statusText: savedState.autoMiners.notice?.args?.text || "",
      }
    : null;
  if (autoMinersState) {
    delete autoMinersState.surveyElapsedMs;
    delete autoMinersState.workerElapsedMs;
    delete autoMinersState.notice;
  }

  isRevealing = false;
  revealToken += 1;
  boardInputController.cancel();
  autoQueueView = false;
  lastChallengeTickTime = now;
  contractModalElement.hidden = true;
  fieldClearModalElement.hidden = true;
  equipmentInventoryElement.hidden = true;
  document.body.classList.toggle("is-auto-miners", currentMode === GAME_MODES.autoMiners);

  if (currentMode === GAME_MODES.autoMiners) {
    loadAutoActiveField();
  } else if (fieldQueueState) {
    loadModeState(fieldQueueState);
    if (!developerTelemetry.currentRun) {
      restartDeveloperRun(developerTelemetry, {
        ...settings,
        contractId: activeContractType()?.id || null,
      });
    }
  } else {
    startGame();
    return;
  }
  render();
  scheduleAutosave();
}

function scheduleAutosave() {
  if (!saveReady) return;
  window.clearTimeout(autosaveTimer);
  autosaveTimer = window.setTimeout(saveNow, 350);
}

function saveNow() {
  if (!saveReady) return;
  try {
    const snapshot = captureGameState();
    stateEngine.dispatch({ type: "replaceState", state: snapshot });
    storeSave(snapshot);
    const saveStatus = document.querySelector("#save-status");
    if (saveStatus) saveStatus.textContent = "Saved in this browser.";
  } catch (error) {
    const saveStatus = document.querySelector("#save-status");
    if (saveStatus) saveStatus.textContent = `Autosave unavailable: ${error.message}`;
  }
}

function showSaveNotice(message) {
  const saveStatus = document.querySelector("#save-status");
  if (saveStatus) saveStatus.textContent = message;
}

function dispatchGameAction(type, payload = {}) {
  const result = stateEngine.dispatch({ type, payload });
  scheduleAutosave();
  return result;
}

function createStartingContracts() {
  return {
    boardsUntilNext: CONTRACT_CONFIG.firstAfterBoards,
    offeredIds: [],
    active: null,
    returnSettings: null,
    unlockedTypeCount: 1,
    completedByType: Array.from({ length: CONTRACT_CONFIG.types.length }, () => 0),
    cooldowns: Array.from({ length: CONTRACT_CONFIG.types.length }, () => 0),
  };
}

function createStartingMessageBoard() {
  const startingBoard = {
    challenges: [],
    nextChallengeId: 1,
    nextChallengeInMs: randomChallengeDelayMs(),
  };

  return loadSavedMessageBoard(startingBoard);
}

function loadSavedMessageBoard(fallback) {
  try {
    const saved = readLegacyMessageBoard();
    if (!saved || !Array.isArray(saved.challenges)) return fallback;

    const challenges = saved.challenges
      .filter((challenge) => challenge && typeof challenge.id === "string" && Number.isFinite(challenge.expiresInMs) && challenge.expiresInMs > 0)
      .slice(0, CHALLENGE_CONFIG.maxActive);
    const nextChallengeId = Number.isInteger(saved.nextChallengeId) && saved.nextChallengeId > 0
      ? saved.nextChallengeId
      : fallback.nextChallengeId;
    const nextChallengeInMs = Number.isFinite(saved.nextChallengeInMs) && saved.nextChallengeInMs > 0
      ? saved.nextChallengeInMs
      : fallback.nextChallengeInMs;

    return { challenges, nextChallengeId, nextChallengeInMs };
  } catch {
    return fallback;
  }
}

function saveMessageBoard() {
  scheduleAutosave();
}

function createStartingStats() {
  return createEmptyStats();
}

function createBoard() {
  return createBoardCells(settings);
}

function placeMines(safeIndex) {
  const safeIndexes = safetyIndexesFor(safeIndex);
  const availableIndexes = board
    .filter((cell) => !safeIndexes.has(cell.index) && !cell.flagged)
    .map((cell) => cell.index);
  const mineTarget = Math.min(settings.mines, availableIndexes.length);
  selectMineIndexes(availableIndexes, mineTarget, () => Math.random()).forEach((index) => {
    board[index].mine = true;
  });

  minesPlaced = true;
  placeTreasures(mineTarget);
  updateAdjacency();
}

function placeTreasures(mineTarget) {
  const treasureCandidates = board
    .filter((cell) => !cell.mine)
    .map((cell) => cell.index);
  const treasureIndexes = new Set();
  const contractType = activeContractType();
  const requestedTreasureCount = 1 + player.treasureLevel + (contractType?.bonusTreasures || 0);
  const treasureTarget = Math.min(requestedTreasureCount, mineTarget, treasureCandidates.length);
  const minimum = BALANCE_CONFIG.treasure.startingMinimumCoins
    + player.treasureValueLevel * BALANCE_CONFIG.treasure.minimumGrowth;
  const maximum = BALANCE_CONFIG.treasure.startingMaximumCoins
    + player.treasureValueLevel * BALANCE_CONFIG.treasure.maximumGrowth;

  chooseTreasureIndexes(treasureCandidates, treasureTarget, contractType).forEach((index) => {
    treasureIndexes.add(index);
  });

  treasureIndexes.forEach((index) => {
    board[index].treasure = true;
    board[index].treasureValue = randomInteger(minimum, maximum);
  });
}

function chooseTreasureIndexes(candidates, target, contractType) {
  if (!contractType?.nearMineTreasureWeight) {
    const selected = new Set();
    while (selected.size < target) {
      const randomIndex = Math.floor(Math.random() * candidates.length);
      selected.add(candidates[randomIndex]);
    }
    return [...selected];
  }

  const pool = candidates.map((index) => {
    const cell = board[index];
    const nearMine = neighbors(cell).some((neighbor) => neighbor.mine);
    return {
      index,
      weight: nearMine ? contractType.nearMineTreasureWeight : 1,
    };
  });
  const selected = [];

  while (selected.length < target && pool.length > 0) {
    const totalWeight = pool.reduce((total, item) => total + item.weight, 0);
    let roll = Math.random() * totalWeight;
    const chosenIndex = pool.findIndex((item) => {
      roll -= item.weight;
      return roll <= 0;
    });
    const [chosen] = pool.splice(Math.max(0, chosenIndex), 1);
    selected.push(chosen.index);
  }

  return selected;
}

function safetyIndexesFor(index) {
  const clickedCell = board[index];
  const radius = currentSafetyRadius();
  const safeIndexes = new Set([index]);

  board.forEach((cell) => {
    const rowDistance = Math.abs(cell.row - clickedCell.row);
    const colDistance = Math.abs(cell.col - clickedCell.col);

    if (rowDistance <= radius && colDistance <= radius) {
      safeIndexes.add(cell.index);
    }
  });

  return safeIndexes;
}

function maxSafetyAreaSize(radius = player.safetyRadius) {
  let largestArea = 1;

  for (let row = 0; row < settings.rows; row += 1) {
    for (let col = 0; col < settings.cols; col += 1) {
      const rowSpan = Math.min(settings.rows - 1, row + radius) - Math.max(0, row - radius) + 1;
      const colSpan = Math.min(settings.cols - 1, col + radius) - Math.max(0, col - radius) + 1;
      largestArea = Math.max(largestArea, rowSpan * colSpan);
    }
  }

  return largestArea;
}

function maxMineCount(radius = currentSafetyRadius()) {
  return Math.max(0, settings.rows * settings.cols - maxSafetyAreaSize(radius));
}

function currentSafetyRadius() {
  if (currentMode === GAME_MODES.autoMiners) return surveyorSafetyRadius();
  return player.safetyRadius;
}

function maxUnlockedMineCount() {
  return 1 + player.mineLevel;
}

function availableRows() {
  if (isContractBoardDisplayed()) return [settings.rows];
  return Array.from({ length: Math.max(1, player.tallerGridLevel + 1) }, (_, index) => GRID_LIMITS.min + index);
}

function availableCols() {
  if (isContractBoardDisplayed()) return [settings.cols];
  return Array.from({ length: Math.max(1, player.widerGridLevel + 1) }, (_, index) => GRID_LIMITS.min + index);
}

function availableMines() {
  if (isContractBoardDisplayed()) return [settings.mines];
  const maximum = Math.min(maxMineCount(), maxUnlockedMineCount());
  return maximum >= 1 ? Array.from({ length: maximum }, (_, index) => index + 1) : [];
}

function updateAdjacency(cells = board) {
  updateBoardAdjacency(cells, settings);
}

function neighbors(cell, cells = board) {
  return getNeighbors(cell, cells, settings);
}

function startGame() {
  if (!isContractActive() && player.contracts.returnSettings) {
    settings = player.contracts.returnSettings;
    player.contracts.returnSettings = null;
  }
  if (!isContractActive()) {
    settings.rows = clamp(settings.rows, GRID_LIMITS.min, GRID_LIMITS.min + player.tallerGridLevel);
    settings.cols = clamp(settings.cols, GRID_LIMITS.min, GRID_LIMITS.min + player.widerGridLevel);
    const legalMaximumMines = Math.min(maxMineCount(), maxUnlockedMineCount());
    if (legalMaximumMines >= 1) settings.mines = clamp(settings.mines, 1, legalMaximumMines);
  }
  syncSettingsControls();
  board = createBoard();
  restartDeveloperRun(developerTelemetry, {
    ...settings,
    contractId: activeContractType()?.id || null,
  });
  gameOver = false;
  roundStarted = false;
  roundStartTime = 0;
  roundResolved = false;
  moves = 0;
  flagsPlaced = 0;
  minesPlaced = false;
  isRevealing = false;
  revealToken += 1;
  recentlyRevealed.clear();
  treasurePopups.clear();
  emergencyHandoutNotice = false;
  emergencyHandoutStatus = "";
  roundTreasureValue = 0;
  roundTreasureCount = 0;
  roundFlagPlacements = 0;
  roundUsedChording = false;
  selectedEquipmentId = null;
  activeEquipment = createRoundEquipmentState();
  equipmentInventoryElement.hidden = true;
  equipmentToggleButton.setAttribute("aria-expanded", "false");
  boardInputController.cancel();
  resetButton.textContent = "READY";
  statusElement.textContent = player.shovelUses > 0
    ? formatMessage("idle")
    : formatMessage("idleNoShovels");
  render();
}

function render() {
  const isAutoMode = currentMode === GAME_MODES.autoMiners;
  boardElement.innerHTML = "";
  updateSurveyorUI();
  if (isAutoMode && autoQueueView) {
    renderAutoQueueView();
    updateQuartermaster();
    updateModeUI();
    updateProgressionUI();
    updateCurioUI();
    updateContractUI();
    updateChallengeUI();
    updateStatsUI();
    return;
  }
  if (isAutoMode && !hasActiveAutoField()) {
    boardElement.classList.remove("is-revealing");
    boardElement.removeAttribute("style");
    boardElement.setAttribute("aria-label", "Auto Miner field queue is empty");
    boardElement.innerHTML = '<p class="queue-empty">Awaiting a Surveyor field report</p>';
    mineCountElement.textContent = "00";
    moveCountElement.textContent = "00";
    settingsNote.textContent = "No minefield is generated until a Surveyor finds one.";
    updateQuartermaster();
    updateModeUI();
    updateProgressionUI();
    updateCurioUI();
    updateContractUI();
    updateChallengeUI();
    updateStatsUI();
    return;
  }
  boardElement.classList.toggle("is-revealing", isRevealing);
  boardElement.style.aspectRatio = `${settings.cols} / ${settings.rows}`;
  boardElement.style.gridTemplateColumns = `repeat(${settings.cols}, minmax(0, 1fr))`;
  boardElement.style.gridTemplateRows = `repeat(${settings.rows}, minmax(0, 1fr))`;
  boardElement.setAttribute("aria-label", `${settings.cols} by ${settings.rows} minesweeper board`);

  board.forEach((cell) => {
    const button = document.createElement("button");
    button.className = "cell";
    button.type = "button";
    button.setAttribute("role", "gridcell");
    button.setAttribute("aria-label", labelForCell(cell));
    button.dataset.index = String(cell.index);

    if (cell.open) {
      button.classList.add("is-open");
      if (recentlyRevealed.has(cell.index)) button.classList.add("is-newly-open");
      if (cell.mine) {
        button.classList.add("is-mine");
        button.textContent = "✹";
      } else if (cell.treasure) {
        button.classList.add("is-treasure");
        button.title = `Treasure cache: +${formatCurrency(cell.treasureValue)} at round end`;
        button.textContent = cell.adjacent > 0 ? String(cell.adjacent) : "✦";
        if (treasurePopups.has(cell.index)) {
          const popup = document.createElement("span");
          popup.className = "treasure-popup";
          popup.textContent = `+${formatCurrency(treasurePopups.get(cell.index))}`;
          popup.setAttribute("aria-hidden", "true");
          button.append(popup);
        }
      } else if (cell.adjacent > 0) {
        button.dataset.adjacent = String(cell.adjacent);
        button.textContent = String(cell.adjacent);
      }

      if (player.chordingUnlocked && cell.adjacent > 0 && !cell.mine) {
        button.classList.add("is-chordable");
        button.title = formatMessage("chordingReady");
      }
    } else if (cell.flagged) {
      button.classList.add("is-flagged");
      button.textContent = "⚑";
    } else if (selectedEquipmentId && equipmentTargetsHiddenCell(selectedEquipmentId)) {
      button.classList.add("is-equipment-target");
    }

    boardInputController.bind(button, {
      enableLongPress: isAutoMode || !selectedEquipmentId,
      onActivate: () => dispatchGameAction("board/activate", { index: cell.index }),
      onFlag: () => dispatchGameAction("board/flag", { index: cell.index }),
    });

    boardElement.append(button);
  });

  mineCountElement.textContent = String(Math.max(currentMineCount() - flagsPlaced, 0)).padStart(2, "0");
  moveCountElement.textContent = String(moves).padStart(2, "0");
  settingsNote.textContent = isAutoMode
    ? `Auto Miners use ${settings.rows}×${settings.cols} with ${settings.mines} mine${settings.mines === 1 ? "" : "s"}.`
    : formatMessage("settingsNote", {
      mines: settings.mines,
      plural: settings.mines === 1 ? "" : "s",
      safety: player.safetyRadius > 0
        ? formatMessage("safetyNote", { radius: player.safetyRadius })
        : formatMessage("firstTileSafe"),
    });
  syncSettingsControls();
  updateQuartermaster();
  updateModeUI();
  updateProgressionUI();
  updateCurioUI();
  updateContractUI();
  updateChallengeUI();
  updateStatsUI();
}

function labelForCell(cell) {
  if (cell.open && cell.mine) return `Row ${cell.row + 1}, column ${cell.col + 1}, mine`;
  if (cell.open && cell.treasure) return `Row ${cell.row + 1}, column ${cell.col + 1}, treasure worth ${formatCurrency(cell.treasureValue)} at round end`;
  if (cell.open && cell.adjacent > 0) return `Row ${cell.row + 1}, column ${cell.col + 1}, ${cell.adjacent} nearby mines`;
  if (cell.open) return `Row ${cell.row + 1}, column ${cell.col + 1}, clear`;
  if (cell.flagged) return `Row ${cell.row + 1}, column ${cell.col + 1}, flagged`;
  return `Row ${cell.row + 1}, column ${cell.col + 1}, hidden`;
}

function openCell(index) {
  const cell = board[index];
  if (gameOver || isRevealing || cell.open || cell.flagged) return;
  if (currentMode === GAME_MODES.autoMiners) {
    startRoundIfNeeded();
    moves += 1;
    if (cell.mine) {
      cell.open = true;
      loseGame();
      return;
    }
    revealAutoCell(cell);
    if (hasWon()) winGame();
    else {
      statusElement.textContent = `Field Queue: opened row ${cell.row + 1}, column ${cell.col + 1}.`;
      saveAutoActiveField();
      render();
    }
    return;
  }
  if (!canDig()) {
    if (!maybeGrantEmergencyShovel()) {
      emergencyHandoutNotice = false;
      statusElement.textContent = formatMessage("noShovels");
      render();
      return;
    }
  } else {
    emergencyHandoutNotice = false;
  }

  startRoundIfNeeded();
  recordDeveloperEvent(developerTelemetry, { type: "dig" });

  if (!minesPlaced) placeMines(cell.index);
  moves += 1;

  if (cell.mine) {
    recordDeveloperEvent(developerTelemetry, { type: "mineHit" });
    player.stats.minesTriggered += 1;
    if (absorbExplosionWithBombBot(cell)) return;
    breakShovel();
    cell.open = true;
    loseGame();
    return;
  }

  // A manual dig costs one durability, regardless of how many tiles its
  // cascade reveals. Chording passes consumeDurability: false below, so it
  // never adds a cost for any of its revealed tiles.
  consumeShovel();
  isRevealing = true;
  const currentRevealToken = ++revealToken;
  revealGradually(cell, currentRevealToken, { consumeDurability: false }).then((revealCompleted) => {
    if (currentRevealToken !== revealToken) return;

    isRevealing = false;
    const shouldPreserveHandout = emergencyHandoutNotice;
    if (hasWon()) {
      winGame();
      if (shouldPreserveHandout) {
        emergencyHandoutNotice = true;
        statusElement.textContent = emergencyHandoutStatus;
      }
    } else if (emergencyHandoutNotice) {
      render();
    } else if (!revealCompleted || !canDig()) {
      statusElement.textContent = formatMessage("shovelsSpent");
    } else {
      statusElement.textContent = formatMessage("cleanHit");
    }
    render();
  });
}

function revealGradually(startCell, token, { consumeDurability = false } = {}) {
  const waves = revealWavesFrom(startCell);

  return (async () => {
    for (const wave of waves) {
      for (const cell of wave) {
        if (token !== revealToken || gameOver) return false;
        if (cell.open || cell.flagged || cell.mine) continue;
        if (consumeDurability && !consumeShovel()) return false;

        cell.open = true;
        recordDeveloperEvent(developerTelemetry, { type: "reveal" });
        player.stats.safeTilesDug += 1;
        tickBombBotUse();
        collectTreasure(cell);
        recentlyRevealed = new Set([cell.index]);
        render();
        recentlyRevealed.clear();
        await delay(BALANCE_CONFIG.reveal.tileDelayMs);
      }
      await delay(BALANCE_CONFIG.reveal.waveDelayMs);
    }
    return true;
  })();
}

function revealWavesFrom(startCell) {
  return calculateRevealWaves(board, settings, startCell.index)
    .map((wave) => wave.map((index) => board[index]));
}

async function chordCell(index) {
  const cell = board[index];
  if (gameOver || isRevealing || !cell.open || cell.mine || cell.adjacent <= 0) return;

  const chord = evaluateChord(board, settings, index);
  if (!chord.allowed) {
    statusElement.textContent = formatMessage("chordNeedsFlags", { required: chord.required, actual: chord.actual });
    render();
    return;
  }

  const candidates = chord.candidates.map((candidateIndex) => board[candidateIndex]);
  if (candidates.length === 0) return;

  moves += 1;
  roundUsedChording = true;
  recordDeveloperEvent(developerTelemetry, { type: "chord" });
  isRevealing = true;
  const token = ++revealToken;
  const safeCandidates = candidates.filter((candidate) => !candidate.mine);
  for (const candidate of safeCandidates) {
    if (token !== revealToken || gameOver) return;
    const revealCompleted = await revealGradually(candidate, token, { consumeDurability: false });
    if (!revealCompleted) {
      isRevealing = false;
      render();
      return;
    }
  }

  if (token !== revealToken || gameOver) return;
  const mineCandidate = candidates.find((candidate) => candidate.mine);
  if (mineCandidate) {
    recordDeveloperEvent(developerTelemetry, { type: "mineHit" });
    player.stats.minesTriggered += 1;
    if (absorbExplosionWithBombBot(mineCandidate)) {
      isRevealing = false;
      return;
    }
    breakShovel();
    mineCandidate.open = true;
    isRevealing = false;
    loseGame();
    return;
  }

  isRevealing = false;
  if (hasWon()) winGame();
  else statusElement.textContent = formatMessage("chordingComplete");
  render();
}

function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function collectTreasure(cell) {
  if (!cell.treasure || cell.treasureCollected) return;

  cell.treasureCollected = true;
  roundTreasureValue += cell.treasureValue;
  roundTreasureCount += 1;
  player.stats.treasureCachesFound += 1;
  treasurePopups.set(cell.index, cell.treasureValue);
  window.setTimeout(() => {
    if (treasurePopups.get(cell.index) !== cell.treasureValue) return;
    treasurePopups.delete(cell.index);
    render();
  }, 900);
  const foundCurio = rollCurio();
  if (!emergencyHandoutNotice) {
    statusElement.textContent = formatMessage("treasureFound", { value: formatCurrency(cell.treasureValue) })
      + (foundCurio ? formatMessage("curioFound", { item: foundCurio }) : "");
  }
}

function rollCurio() {
  const chance = curioChance();
  if (Math.random() >= chance) {
    player.curioMisses += 1;
    return null;
  }

  const item = randomInteger(1, BALANCE_CONFIG.curio.itemCount);
  player.curios[item - 1] += 1;
  player.curioMisses = 0;
  player.stats.curiosFound += 1;
  return item;
}

function toggleFlag(index) {
  const cell = board[index];
  if (gameOver || isRevealing || cell.open) return;

  if (currentMode === GAME_MODES.autoMiners) {
    cell.flagged = !cell.flagged;
    cell.flaggedByPlayer = cell.flagged;
    flagsPlaced += cell.flagged ? 1 : -1;
    moves += 1;
    statusElement.textContent = cell.flagged ? "Field Queue: flag planted." : "Field Queue: flag cleared.";
    saveAutoActiveField();
    render();
    return;
  }

  if (!cell.flagged && activeEquipment.mineEncapsulationUses > 0) {
    useMineEncapsulation(cell);
    return;
  }

  if (!cell.flagged && player.flags <= 0) {
    emergencyHandoutNotice = false;
    statusElement.textContent = formatMessage("flagPouchEmpty");
    render();
    return;
  }

  emergencyHandoutNotice = false;
  cell.flagged = !cell.flagged;
  cell.flaggedByPlayer = cell.flagged;
  if (cell.flagged) roundFlagPlacements += 1;
  recordDeveloperEvent(developerTelemetry, { type: cell.flagged ? "flagPlaced" : "flagRemoved" });
  flagsPlaced += cell.flagged ? 1 : -1;
  player.flags += cell.flagged ? -1 : 1;
  statusElement.textContent = formatMessage(cell.flagged ? "flagPlanted" : "flagCleared");
  render();
}

function useSelectedEquipment(index) {
  const item = SPECIAL_EQUIPMENT_BY_ID[selectedEquipmentId];
  if (!item || (player.specialEquipment[item.id] || 0) <= 0) {
    clearSelectedEquipment();
    render();
    return;
  }

  if (gameOver || isRevealing) return;
  if (!minesPlaced) {
    statusElement.textContent = "Dig one square before using special equipment; mines are placed after the first click.";
    render();
    return;
  }

  const cell = board[index];
  if (!cell) return;

  if (item.id === "probeCharge") {
    if (cell.open) {
      statusElement.textContent = "Probe Charge needs a hidden square.";
      render();
      return;
    }
    startRoundIfNeeded();
    spendSelectedEquipment(item.id);
    statusElement.textContent = cell.mine
      ? `Probe Charge: row ${cell.row + 1}, column ${cell.col + 1} contains a mine.`
      : `Probe Charge: row ${cell.row + 1}, column ${cell.col + 1} is clear.`;
  } else if (item.id === "controlledBlast") {
    startRoundIfNeeded();
    spendSelectedEquipment(item.id);
    const destroyed = controlledBlast(cell);
    statusElement.textContent = `Controlled Blast opened the zone${destroyed > 0 ? ` and destroyed ${destroyed} mine${destroyed === 1 ? "" : "s"}` : ""}.`;
  } else if (item.id === "seismicTrap") {
    startRoundIfNeeded();
    spendSelectedEquipment(item.id);
    const total = rowColumnMineCount(cell);
    statusElement.textContent = `Seismic Trap: ${total} mine${total === 1 ? "" : "s"} in that row and column.`;
  } else if (item.id === "bombBot") {
    startRoundIfNeeded();
    spendSelectedEquipment(item.id);
    activeEquipment.bombBotUses = 15;
    statusElement.textContent = "Bomb-Bot deployed for the next 15 opened squares.";
  } else if (item.id === "mineEncapsulation") {
    startRoundIfNeeded();
    spendSelectedEquipment(item.id);
    activeEquipment.mineEncapsulationUses = 20;
    statusElement.textContent = "Mine Encapsulation armed for the next 20 flag attempts.";
  }

  clearSelectedEquipment();
  if (hasWon()) winGame();
  render();
}

function spendSelectedEquipment(id) {
  player.specialEquipment[id] = Math.max(0, (player.specialEquipment[id] || 0) - 1);
  recordDeveloperEvent(developerTelemetry, { type: "equipment", id });
}

function clearSelectedEquipment() {
  selectedEquipmentId = null;
  equipmentInventoryElement.hidden = true;
  equipmentToggleButton.setAttribute("aria-expanded", "false");
}

function equipmentTargetsHiddenCell(id) {
  return id === "probeCharge" || id === "controlledBlast" || id === "seismicTrap";
}

function controlledBlast(centerCell) {
  let destroyed = 0;
  const rowStart = Math.max(0, centerCell.row - 1);
  const rowEnd = Math.min(settings.rows - 1, centerCell.row + 1);
  const colStart = Math.max(0, centerCell.col - 1);
  const colEnd = Math.min(settings.cols - 1, centerCell.col + 1);

  for (let row = rowStart; row <= rowEnd; row += 1) {
    for (let col = colStart; col <= colEnd; col += 1) {
      const cell = board[row * settings.cols + col];
      if (cell.mine) {
        destroyMine(cell);
        destroyed += 1;
      } else if (!cell.open) {
        if (cell.flagged) {
          flagsPlaced = Math.max(0, flagsPlaced - 1);
          if (cell.flaggedByPlayer) player.flags = Math.min(flagCapacity(), player.flags + 1);
        }
        cell.flagged = false;
        cell.flaggedByPlayer = false;
        cell.open = true;
        recordDeveloperEvent(developerTelemetry, { type: "reveal" });
        player.stats.safeTilesDug += 1;
        collectTreasure(cell);
      }
    }
  }

  updateAdjacency();
  return destroyed;
}

function rowColumnMineCount(centerCell) {
  return board.filter((cell) => (
    cell.mine
    && (cell.row === centerCell.row || cell.col === centerCell.col)
  )).length;
}

function useMineEncapsulation(cell) {
  activeEquipment.mineEncapsulationUses = Math.max(0, activeEquipment.mineEncapsulationUses - 1);
  roundFlagPlacements += 1;
  recordDeveloperEvent(developerTelemetry, { type: "flagPlaced" });

  if (cell.mine) {
    player.mines += 1;
    recordDeveloperEvent(developerTelemetry, { type: "recoveredMines", count: 1 });
    player.specialEquipmentUnlocked = true;
    player.stats.minesCorrectlyFlagged += 1;
    player.stats.minesRecovered += 1;
    destroyMine(cell);
    statusElement.textContent = `Mine encapsulated and collected. ${activeEquipment.mineEncapsulationUses} use${activeEquipment.mineEncapsulationUses === 1 ? "" : "s"} left.`;
    if (hasWon()) winGame();
    else render();
    return;
  }

  cell.open = true;
  cell.flagged = false;
  cell.flaggedByPlayer = false;
  recordDeveloperEvent(developerTelemetry, { type: "reveal" });
  player.stats.safeTilesDug += 1;
  collectTreasure(cell);
  statusElement.textContent = `No mine was there. Encapsulation use wasted; ${activeEquipment.mineEncapsulationUses} left.`;
  if (hasWon()) winGame();
  else render();
}

function absorbExplosionWithBombBot(cell) {
  if (activeEquipment.bombBotUses <= 0) return false;

  activeEquipment.bombBotUses = 0;
  destroyMine(cell);
  statusElement.textContent = "Bomb-Bot absorbed the explosion. The round continues.";
  if (hasWon()) winGame();
  else render();
  return true;
}

function tickBombBotUse() {
  if (activeEquipment.bombBotUses <= 0) return;
  activeEquipment.bombBotUses = Math.max(0, activeEquipment.bombBotUses - 1);
}

function destroyMine(cell) {
  if (!cell.mine) return;
  if (cell.flagged) {
    flagsPlaced = Math.max(0, flagsPlaced - 1);
    if (cell.flaggedByPlayer) player.flags = Math.min(flagCapacity(), player.flags + 1);
  }
  cell.mine = false;
  cell.flagged = false;
  cell.flaggedByPlayer = false;
  cell.open = true;
  updateAdjacency();
}

function currentMineCount() {
  return minesPlaced ? board.filter((cell) => cell.mine).length : settings.mines;
}

function startRoundIfNeeded() {
  if (roundStarted) return;
  roundStarted = true;
  roundStartTime = performance.now();
}

function loseGame() {
  if (roundResolved) return;
  if (currentMode === GAME_MODES.autoMiners) {
    finishAutoField(false);
    return;
  }
  roundResolved = true;
  gameOver = true;
  const contractType = activeContractType();
  const elapsed = roundStarted ? Math.max(0, performance.now() - roundStartTime) : 0;
  resolveDeveloperRun(developerTelemetry, "mine_hit", elapsed);
  player.stats.boardsLost += 1;
  player.stats.currentWinStreak = 0;
  player.stats.minesCorrectlyFlagged += countCorrectPlayerFlags();
  tickContractCooldowns();
  resetButton.textContent = contractType ? "DONE" : "RETRY";
  board.forEach((cell) => {
    if (cell.mine) cell.open = true;
  });
  if (contractType) {
    statusElement.textContent = failContract(contractType);
    render();
    return;
  }
  advanceContractSchedule();
  if (!maybeGrantEmergencyShovel("Boom. The shovel shattered.")) {
    emergencyHandoutNotice = false;
    statusElement.textContent = formatMessage("boomWaiting");
  }
  render();
}

function winGame() {
  if (roundResolved) return;
  if (currentMode === GAME_MODES.autoMiners) {
    finishAutoField(true);
    return;
  }
  roundResolved = true;
  gameOver = true;
  const contractType = activeContractType();
  const actualMineCount = board.filter((cell) => cell.mine).length;
  const correctFlags = countCorrectPlayerFlags();
  const roundPayout = calculateRoundPayout(roundTreasureValue, actualMineCount, mineYieldPercent());
  const elapsed = Math.max(0, performance.now() - roundStartTime);
  const configKey = `${settings.rows}×${settings.cols} / ${actualMineCount} mine${actualMineCount === 1 ? "" : "s"}`;

  player.coins += roundPayout;
  recordDeveloperEvent(developerTelemetry, { type: "coinsEarned", count: roundPayout });
  player.stats.boardsCompleted += 1;
  player.stats.coinsEarned += roundPayout;
  player.stats.minesCorrectlyFlagged += correctFlags;
  player.stats.currentWinStreak += 1;
  player.stats.longestWinStreak = Math.max(player.stats.longestWinStreak, player.stats.currentWinStreak);
  player.stats.largestBoardCompleted = Math.max(player.stats.largestBoardCompleted, settings.rows * settings.cols);
  player.stats.highestMineDensityCompleted = Math.max(
    player.stats.highestMineDensityCompleted,
    settings.rows * settings.cols ? actualMineCount / (settings.rows * settings.cols) : 0,
  );
  player.stats.fastestClears[configKey] = Math.min(player.stats.fastestClears[configKey] || Number.POSITIVE_INFINITY, elapsed);

  const recovered = recoverFlaggedMines();
  recordDeveloperEvent(developerTelemetry, { type: "recoveredMines", count: recovered });
  tickContractCooldowns();
  const contractText = contractType ? ` ${completeContract(contractType)}` : "";
  const challengeText = completeMatchingChallenges({
    rows: settings.rows,
    cols: settings.cols,
    mines: actualMineCount,
    elapsed,
    flagPlacements: roundFlagPlacements,
    usedChording: roundUsedChording,
  });
  resolveDeveloperRun(developerTelemetry, contractType ? "contract_completed" : "cleared", elapsed);
  if (!contractType) advanceContractSchedule();
  resetButton.textContent = "AGAIN";
  board.forEach((cell) => {
    if (cell.mine && !cell.flagged) {
      cell.flagged = true;
      cell.flaggedByPlayer = false;
      flagsPlaced += 1;
    }
  });

  const rewardText = roundPayout > 0
    ? formatMessage("rewardSuffix", { value: formatCurrency(roundPayout) })
    : formatMessage("noTreasurePayout");
  const recoveryText = recovered > 0
    ? formatMessage("recoverySuffix", { count: recovered, plural: recovered === 1 ? "" : "s" })
    : "";
  statusElement.textContent = formatMessage("boardClear", { reward: rewardText, recovery: recoveryText }) + contractText + challengeText;
}

function recoverFlaggedMines() {
  const chance = Math.min(1, mineCollectionChance() + (activeContractType()?.recoveryBonus || 0));
  if (chance <= 0) return 0;

  let recovered = 0;
  board.filter((cell) => cell.mine && cell.flaggedByPlayer).forEach((cell) => {
    if (Math.random() < chance) recovered += 1;
  });
  player.mines += recovered;
  player.stats.minesRecovered += recovered;
  return recovered;
}

function countCorrectPlayerFlags() {
  return board.filter((cell) => cell.mine && cell.flaggedByPlayer).length;
}

function hasWon() {
  return hasClearedBoard(board);
}

function canDig() {
  return player.shovelUses >= BALANCE_CONFIG.digCostPerTile;
}

function consumeShovel() {
  if (!canDig()) return false;

  const durability = currentShovel().durability;
  const result = consumeShovelState({
    shovelUses: player.shovelUses,
    shovelDurability: durability,
    cost: BALANCE_CONFIG.digCostPerTile,
  });
  recordDeveloperEvent(developerTelemetry, { type: "shovelDurability", count: BALANCE_CONFIG.digCostPerTile });
  if (result.broke) recordDeveloperEvent(developerTelemetry, { type: "shovelConsumed" });
  player.shovelUses = result.shovelUses;
  player.shovels = result.shovels;
  if (result.broke) player.stats.shovelsBroken += 1;
  maybeGrantEmergencyShovel();
  return true;
}

function breakShovel() {
  if (player.shovels <= 0 || player.shovelUses <= 0) return;

  const durability = currentShovel().durability;
  const currentUses = player.shovelUses % durability || durability;
  const result = breakCurrentShovelState({
    shovelUses: player.shovelUses,
    shovelDurability: durability,
    shovels: player.shovels,
  });
  recordDeveloperEvent(developerTelemetry, { type: "shovelDurability", count: currentUses });
  if (result.broke) recordDeveloperEvent(developerTelemetry, { type: "shovelConsumed" });
  player.shovelUses = result.shovelUses;
  player.shovels = result.shovels;
  if (result.broke) player.stats.shovelsBroken += 1;
}

function canPurchase() {
  return !isContractActive();
}

function buyShovel() {
  const cost = shovelSupplyCost();
  if (!canPurchase() || player.coins < cost || player.shovels >= shovelCapacity()) return;

  emergencyHandoutNotice = false;
  player.coins -= cost;
  player.shovels += 1;
  player.shovelUses += currentShovel().durability;
  recordDeveloperEvent(developerTelemetry, { type: "purchase", id: "shovel" });
  statusElement.textContent = formatMessage("suppliesShovel");
  render();
}

function buyFlags() {
  const cost = flagSupplyCost();
  if (!canPurchase() || player.coins < cost || player.flags >= flagCapacity()) return;

  emergencyHandoutNotice = false;
  player.coins -= cost;
  player.flags = Math.min(flagCapacity(), player.flags + BALANCE_CONFIG.shovel.flagBundleSize);
  recordDeveloperEvent(developerTelemetry, { type: "purchase", id: "flags" });
  statusElement.textContent = formatMessage("suppliesFlags", { count: BALANCE_CONFIG.shovel.flagBundleSize });
  render();
}

function buySpecialEquipment(id) {
  const item = SPECIAL_EQUIPMENT_BY_ID[id];
  if (!item || !canPurchase() || player.mines < item.cost || !hasSpecialEquipmentAccess()) return;

  player.mines -= item.cost;
  player.specialEquipment[id] = (player.specialEquipment[id] || 0) + 1;
  recordDeveloperEvent(developerTelemetry, { type: "purchase", id: `equipment:${id}` });
  statusElement.textContent = `${item.name} stocked. Open the cabinet inventory during a round to use it.`;
  render();
}

function activateEquipment(id) {
  const item = SPECIAL_EQUIPMENT_BY_ID[id];
  if (!item || (player.specialEquipment[id] || 0) <= 0) return;

  if (equipmentTargetsHiddenCell(id)) {
    if (!minesPlaced) {
      selectedEquipmentId = null;
      statusElement.textContent = "Dig one square before using targeted equipment; mines are placed after the first click.";
      render();
      return;
    }
    selectedEquipmentId = selectedEquipmentId === id ? null : id;
    statusElement.textContent = selectedEquipmentId
      ? `${item.name} selected. Choose a square on the board.`
      : `${item.name} selection canceled.`;
    render();
    return;
  }

  selectedEquipmentId = id;
  useSelectedEquipment(0);
}

function improveShovel() {
  buyUpgrade("improveShovel");
}

function buyUpgrade(id) {
  if (!canPurchase() || !isUpgradeUnlocked(id)) return;
  const item = PROGRESSION_CONFIG.items[id];
  if (!item) return;

  if (id === "improveShovel") {
    const nextTierIndex = player.shovelTier + 1;
    if (nextTierIndex >= BALANCE_CONFIG.shovel.tiers.length) return;
    const cost = exponentialCost(item.baseCost, item.growth, player.shovelTier);
    if (player.coins < cost) return;
    const intactShovels = player.shovels;
    player.coins -= cost;
    player.shovelTier = nextTierIndex;
    player.shovelUses = intactShovels * currentShovel().durability;
  } else {
    const levelKeys = {
      tallerGrid: "tallerGridLevel",
      widerGrid: "widerGridLevel",
      addMine: "mineLevel",
      addTreasure: "treasureLevel",
      mineYield: "mineYieldLevel",
      treasureValue: "treasureValueLevel",
      betterFlags: "betterFlagsLevel",
    };
    const levelKey = levelKeys[id];
    if (!levelKey) return;
    const level = player[levelKey];
    const cost = exponentialCost(item.baseCost, item.growth, level);
    if (player.coins < cost) return;
    if ((id === "tallerGrid" || id === "widerGrid") && level >= GRID_LIMITS.max - GRID_LIMITS.min) return;
    player.coins -= cost;
    player[levelKey] += 1;
  }

  statusElement.textContent = formatMessage("upgradeInstalled", { name: item.name });
  recordDeveloperEvent(developerTelemetry, { type: "purchase", id: `upgrade:${id}` });
  render();
}

function buyCapacityUpgrade(kind) {
  if (!canPurchase()) return;
  const levels = kind === "shovel" ? BALANCE_CONFIG.capacity.shovel : BALANCE_CONFIG.capacity.flags;
  const levelKey = kind === "shovel" ? "shovelCapacityLevel" : "flagCapacityLevel";
  const costs = kind === "shovel" ? BALANCE_CONFIG.upgrades.shovelCapacityCosts : BALANCE_CONFIG.upgrades.flagCapacityCosts;
  const level = player[levelKey];
  if (level + 1 >= levels.length) return;
  const cost = costs[level];
  if (player.coins < cost) return;

  player.coins -= cost;
  player[levelKey] += 1;
  recordDeveloperEvent(developerTelemetry, { type: "purchase", id: `capacity:${kind}` });
  statusElement.textContent = formatMessage("storageExpanded", { kind: kind === "shovel" ? COPY_CONFIG.upgradeLabels.shovelLocker : COPY_CONFIG.upgradeLabels.flagLocker });
  render();
}

function buyAbility(id) {
  if (!canPurchase()) return;
  let abilityMessage = formatMessage("abilityInstalled");

  if (id === "safetyRadius") {
    if (player.safetyRadius >= 5) return;
    if (maxMineCount(player.safetyRadius + 1) < 1) return;
    const cost = BALANCE_CONFIG.abilities.safetyRadiusCosts[player.safetyRadius];
    if (player.coins < cost) return;
    player.coins -= cost;
    player.safetyRadius += 1;
    settings.mines = Math.min(settings.mines, Math.min(maxMineCount(), maxUnlockedMineCount()));
    abilityMessage = formatMessage("safetyInstalled", { value: player.safetyRadius });
  } else if (id === "chording") {
    if (player.chordingUnlocked || player.shovelTier < 3 || player.mines < BALANCE_CONFIG.abilities.chordingMineCost) return;
    player.mines -= BALANCE_CONFIG.abilities.chordingMineCost;
    player.chordingUnlocked = true;
    abilityMessage = formatMessage("chordingUnlocked");
  }
  recordDeveloperEvent(developerTelemetry, { type: "purchase", id: `ability:${id}` });
  if (!roundStarted || gameOver) startGame();
  statusElement.textContent = abilityMessage;
  render();
}

function maybeGrantEmergencyShovel(prefix = "") {
  const emergency = BALANCE_CONFIG.emergencyShovel;
  if (!emergency.enabled || player.emergencyShovelUsed || player.shovels > 0 || player.shovelUses > 0 || player.coins >= shovelSupplyCost()) return false;

  player.emergencyShovelUsed = true;
  player.shovels = 1;
  player.shovelUses = emergency.durability;
  emergencyHandoutNotice = true;
  const lead = prefix ? `${prefix} ` : "";
  emergencyHandoutStatus = formatMessage("emergency", {
    prefix: lead,
    count: emergency.durability,
    warning: emergency.warning,
  });
  statusElement.textContent = emergencyHandoutStatus;
  return true;
}

function resetProgress() {
  player = createStartingPlayer();
  developerTelemetry = createDeveloperTelemetry();
  clearStoredSaves();
  saveReady = true;
  player.messageBoard = {
    challenges: [],
    nextChallengeId: 1,
    nextChallengeInMs: randomChallengeDelayMs(),
  };
  settings = { ...DEFAULT_SETTINGS };
  currentMode = GAME_MODES.fieldQueue;
  fieldQueueState = null;
  autoMinersState = null;
  autoQueueView = false;
  contractModalElement.hidden = true;
  fieldClearModalElement.hidden = true;
  document.body.classList.remove("is-contract-running", "is-auto-miners");
  startGame();
  statusElement.textContent = formatMessage("progressReset");
  render();
}

function switchToFieldQueue() {
  if (currentMode === GAME_MODES.fieldQueue) return;
  saveCurrentModeState();
  currentMode = GAME_MODES.fieldQueue;
  autoQueueView = false;
  document.body.classList.remove("is-auto-miners");
  if (fieldQueueState) loadModeState(fieldQueueState);
  render();
}

function showAutoQueueList() {
  if (currentMode === GAME_MODES.autoMiners) {
    if (autoQueueView) return;
    saveAutoActiveField();
    autoQueueView = true;
    render();
    return;
  }
  saveCurrentModeState();
  currentMode = GAME_MODES.autoMiners;
  document.body.classList.add("is-auto-miners");
  if (!autoMinersState) autoMinersState = createAutoMinersState();
  autoQueueView = true;
  resetButton.textContent = "BACK";
  render();
}

function switchToAutoMiners() {
  if (currentMode === GAME_MODES.autoMiners) {
    autoQueueView = false;
    loadAutoActiveField();
    render();
    return;
  }
  saveCurrentModeState();
  currentMode = GAME_MODES.autoMiners;
  autoQueueView = false;
  document.body.classList.add("is-auto-miners");
  if (!autoMinersState) autoMinersState = createAutoMinersState();
  loadAutoActiveField();
  resetButton.textContent = "BACK";
  render();
}

function createAutoMinersState() {
  return createAutoMinerState(SPECIALISTS, performance.now());
}

function tickAutoMiners() {
  if (!fieldClearModalElement.hidden) return;
  if (!autoMinersState) {
    updateSurveyorUI();
    return;
  }
  const now = performance.now();
  let changed = false;
  if (specialistLevel("surveyor") > 0
    && autoMinersState.queue.length < 5
    && now - autoMinersState.lastSurveyAt >= surveyorIntervalMs()) {
    autoMinersState.queue.push(createQueuedField());
    autoMinersState.lastSurveyAt = now;
    autoMinersState.statusText = "Surveyor located a new field.";
    changed = true;
  }

  if (now - autoMinersState.lastWorkerTickAt >= 1000) {
    autoMinersState.lastWorkerTickAt = now;
    changed = runWorkerInitiative("agents") || changed;
    changed = runWorkerInitiative("specialists") || changed;
  }

  if (currentMode === GAME_MODES.autoMiners && changed) {
    loadAutoActiveField();
    render();
  }
  updateSurveyorUI();
}

function updateSurveyorUI() {
  if (!autoMinersState || specialistLevel("surveyor") <= 0) {
    surveyorCountdownElement.textContent = "locked";
    return;
  }
  if (autoMinersState.queue.length >= 5) {
    surveyorCountdownElement.textContent = "queue full";
    return;
  }
  const remaining = surveyorIntervalMs() - (performance.now() - autoMinersState.lastSurveyAt);
  surveyorCountdownElement.textContent = formatClock(remaining);
}

function surveyNow() {
  if (!autoMinersState) autoMinersState = createAutoMinersState();
  if (autoMinersState.queue.length >= 5) {
    statusElement.textContent = "Survey skipped: the Field Queue is full.";
    render();
    return;
  }
  if (currentMode === GAME_MODES.autoMiners) saveAutoActiveField();
  autoMinersState.queue.push(createQueuedField());
  autoMinersState.lastSurveyAt = performance.now();
  autoMinersState.statusText = "Debug survey complete. A new field entered the queue.";
  if (currentMode === GAME_MODES.autoMiners) {
    loadAutoActiveField();
    render();
  } else {
    updateSurveyorUI();
  }
}

function hasActiveAutoField() {
  return Boolean(autoMinersState?.queue?.length);
}

function loadAutoActiveField() {
  if (!hasActiveAutoField()) {
    board = [];
    settings = { rows: 1, cols: 1, mines: 0 };
    gameOver = false;
    roundStarted = false;
    roundResolved = false;
    moves = 0;
    flagsPlaced = 0;
    minesPlaced = false;
    statusElement.textContent = autoMinersState?.statusText || "Hire a Surveyor to begin building the Field Queue.";
    resetButton.textContent = "BACK";
    return;
  }
  loadModeState(autoMinersState.queue[0]);
  resetButton.textContent = "BACK";
}

function saveAutoActiveField() {
  if (!hasActiveAutoField()) return;
  autoMinersState.queue[0] = createModeState();
}

function createQueuedField() {
  const previous = createModeState();
  const rows = GRID_LIMITS.min + player.tallerGridLevel;
  const cols = GRID_LIMITS.min + player.widerGridLevel;
  const maximum = Math.min(maxUnlockedMineCount(), maxMineCountFor(rows, cols, surveyorSafetyRadius()));
  const minimum = Math.min(maximum, Math.max(1, Math.round(rows * cols * 0.1)));
  const normalMaximum = Math.min(maximum, Math.max(minimum, Math.round(rows * cols * 0.18)));
  settings = { rows, cols, mines: randomInteger(minimum, normalMaximum) };
  board = createBoard();
  gameOver = false;
  roundStarted = true;
  roundStartTime = performance.now();
  roundResolved = false;
  moves = 0;
  flagsPlaced = 0;
  minesPlaced = false;
  roundTreasureValue = 0;
  roundTreasureCount = 0;
  treasurePopups.clear();
  const firstCell = board[Math.floor(board.length / 2)] || board[0];
  placeMines(firstCell.index);
  safetyIndexesFor(firstCell.index).forEach((index) => {
    const cell = board[index];
    if (!cell.mine) {
      cell.open = true;
      player.stats.safeTilesDug += 1;
      collectTreasure(cell);
    }
  });
  statusElement.textContent = `Surveyor opened a ${surveyorSafetyRadius() === 2 ? "5x5" : surveyorSafetyRadius() === 1 ? "3x3" : "safe"} starting area.`;
  const field = createModeState();
  field.workerCursors = {};
  loadModeState(previous);
  return field;
}

function runWorkerInitiative(group) {
  const order = autoMinersState.initiative[group] || [];
  let changed = false;
  order.forEach((id) => {
    if (!fieldClearModalElement.hidden) return;
    const level = specialistLevel(id);
    if (id === "surveyor" || level <= 0) return;
    for (let turn = 0; turn < level; turn += 1) changed = runWorkerTurn(id) || changed;
  });
  return changed;
}

function runWorkerTurn(id) {
  const queueIndex = autoMinersState.workerFields[id] || 0;
  if (queueIndex >= autoMinersState.queue.length) return false;
  const activeWasFirst = queueIndex === 0;
  const visibleState = createModeState();
  loadModeState(autoMinersState.queue[queueIndex]);
  const target = id === "excavator" ? findExcavatorTarget() : id === "flagbearer" ? findFlagbearerTarget() : null;
  if (target) {
    if (id === "excavator") revealAutoCell(target);
    else flagAutoCell(target);
    moves += 1;
    autoMinersState.statusText = `${SPECIALISTS.find((worker) => worker.id === id).name} acted on field ${queueIndex + 1}.`;
    const nextState = createModeState();
    nextState.workerCursors = autoMinersState.queue[queueIndex].workerCursors || {};
    autoMinersState.queue[queueIndex] = nextState;
    if (hasWon()) {
      resolveQueuedField(queueIndex, true);
      if (activeWasFirst) loadAutoActiveField();
      else loadModeState(visibleState);
      return true;
    }
  } else {
    autoMinersState.workerFields[id] = queueIndex + 1;
  }
  if (activeWasFirst) loadAutoActiveField();
  else loadModeState(visibleState);
  return true;
}

function scanOrder(id) {
  if (id === "excavator") return board.map((cell) => cell.index);
  const order = [];
  for (let col = 0; col < settings.cols; col += 1) {
    for (let row = settings.rows - 1; row >= 0; row -= 1) order.push(row * settings.cols + col);
  }
  return order;
}

function scanFromCursor(id, predicate) {
  const field = autoMinersState.queue[autoMinersState.workerFields[id] || 0];
  field.workerCursors ||= {};
  const order = scanOrder(id);
  const start = Math.max(0, order.indexOf(field.workerCursors[id]));
  for (let offset = 0; offset < order.length; offset += 1) {
    const cell = board[order[(start + offset) % order.length]];
    const target = predicate(cell);
    if (target) {
      field.workerCursors[id] = cell.index;
      return target;
    }
  }
  return null;
}

function findExcavatorTarget() {
  return scanFromCursor("excavator", (cell) => {
    if (!cell.open || cell.mine || cell.adjacent <= 0) return null;
    const nearby = neighbors(cell);
    if (nearby.filter((neighbor) => neighbor.flagged).length < cell.adjacent) return null;
    return nearby.find((neighbor) => !neighbor.open && !neighbor.flagged && !neighbor.mine) || null;
  });
}

function findFlagbearerTarget() {
  return scanFromCursor("flagbearer", (cell) => {
    if (!cell.open || cell.mine || cell.adjacent <= 0) return null;
    const hidden = neighbors(cell).filter((neighbor) => !neighbor.open && !neighbor.flagged);
    const flags = neighbors(cell).filter((neighbor) => neighbor.flagged).length;
    return hidden.length > 0 && hidden.length === cell.adjacent - flags ? hidden[0] : null;
  });
}

function flagAutoCell(cell) {
  cell.flagged = true;
  cell.flaggedByPlayer = false;
  flagsPlaced += 1;
}

function normalizeWorkerFieldsAfterRemoval(queueIndex) {
  Object.keys(autoMinersState.workerFields).forEach((id) => {
    const position = autoMinersState.workerFields[id] || 0;
    autoMinersState.workerFields[id] = position > queueIndex ? position - 1 : position;
  });
}

function revealAutoCell(startCell) {
  const waves = revealWavesFrom(startCell);
  const opened = new Set();
  waves.flat().forEach((cell) => {
    if (cell.open || cell.flagged || cell.mine) return;
    cell.open = true;
    opened.add(cell.index);
    player.stats.safeTilesDug += 1;
    collectTreasure(cell);
  });
  recentlyRevealed = opened;
  window.setTimeout(() => {
    if (currentMode !== GAME_MODES.autoMiners) return;
    recentlyRevealed.clear();
    render();
  }, 220);
}

function finishAutoField(cleared) {
  if (!autoMinersState || !hasActiveAutoField()) return;
  resolveQueuedField(0, cleared);
  loadAutoActiveField();
  render();
}

function resolveQueuedField(queueIndex, cleared) {
  if (!cleared) {
    autoMinersState.queue.splice(queueIndex, 1);
    normalizeWorkerFieldsAfterRemoval(queueIndex);
    autoMinersState.statusText = "A field collapsed. The crew moved to the next claim.";
    return;
  }
  roundResolved = true;
  gameOver = true;
  const actualMineCount = board.filter((cell) => cell.mine).length;
  const rewardMultiplier = 1 + Math.max(0, actualMineCount - 1) * mineYieldPercent();
  const roundPayout = Math.round(roundTreasureValue * rewardMultiplier);
  player.coins += roundPayout;
  player.stats.boardsCompleted += 1;
  player.stats.coinsEarned += roundPayout;
  player.stats.currentWinStreak += 1;
  player.stats.longestWinStreak = Math.max(player.stats.longestWinStreak, player.stats.currentWinStreak);
  player.stats.largestBoardCompleted = Math.max(player.stats.largestBoardCompleted, settings.rows * settings.cols);
  player.stats.highestMineDensityCompleted = Math.max(
    player.stats.highestMineDensityCompleted,
    settings.rows * settings.cols ? actualMineCount / (settings.rows * settings.cols) : 0,
  );
  board.forEach((cell) => {
    if (cell.mine) {
      cell.flagged = true;
      cell.flaggedByPlayer = false;
    }
  });
  flagsPlaced = actualMineCount;
  autoMinersState.queue.splice(queueIndex, 1);
  normalizeWorkerFieldsAfterRemoval(queueIndex);
  autoMinersState.statusText = `Field cleared.${roundPayout > 0 ? ` +${formatCurrency(roundPayout)} earned.` : " No treasure payout."}`;
  fieldClearModalDescriptionElement.textContent = roundPayout > 0
    ? `The crew cleared a field and earned ${formatCurrency(roundPayout)}.`
    : "The crew cleared a field. No treasure payout was found.";
  fieldClearModalElement.hidden = false;
}

function specialistLevel(id) {
  return Math.max(0, player.specialists?.[id] || 0);
}

function surveyorSafetyRadius() {
  const level = specialistLevel("surveyor");
  if (level >= 20) return 2;
  if (level >= 10) return 1;
  return 0;
}

function surveyorIntervalMs() {
  return calculateSurveyorIntervalMs(specialistLevel("surveyor"));
}

function updateModeUI() {
  const isAutoMode = currentMode === GAME_MODES.autoMiners;
  fieldQueueButton.classList.toggle("is-active", !isAutoMode || autoQueueView);
  autoMinersButton.classList.toggle("is-active", isAutoMode && !autoQueueView);
  quartermasterPanelElement.setAttribute("aria-label", isAutoMode ? "Auto Miner specialists" : "Quartermaster inventory and store");
  specialistsPanelElement.hidden = !isAutoMode;
  document.body.classList.toggle("is-auto-miners", isAutoMode);
  if (!isAutoMode) return;

  autoMineFieldElement.textContent = `${autoMinersState.queue.length} / 5`;
  const surveyorLevel = specialistLevel("surveyor");
  specialistNoteElement.textContent = surveyorLevel > 0
    ? `Surveyor reports every ${formatClock(surveyorIntervalMs())}. Starting area: ${surveyorSafetyRadius() === 2 ? "5x5" : surveyorSafetyRadius() === 1 ? "3x3" : "1 tile"}.`
    : "Hire a Surveyor to begin building the Field Queue.";
  renderSurveyorCard();
  renderWorkerList(agentListElement, "agents");
  renderWorkerList(specialistListElement, "specialists");
}

function renderSurveyorCard() {
  const worker = SPECIALISTS.find((item) => item.id === "surveyor");
  const level = specialistLevel(worker.id);
  const cost = workerCost(worker);
  const affordable = player.coins >= cost;
  surveyorCardElement.innerHTML = `
    <article class="specialist-card${level > 0 ? " is-active" : " is-available"}">
      <div class="specialist-card__topline"><strong>${worker.name}</strong><b>${level > 0 ? `LV ${level}` : "AVAILABLE"}</b></div>
      <p>${worker.task} Current schedule: ${formatClock(surveyorIntervalMs())}.</p>
      <button class="worker-buy" type="button" data-worker-buy="surveyor" ${affordable ? "" : "disabled"}>${formatWorkerCost(worker, cost)}</button>
    </article>
  `;
  surveyorCardElement.querySelector("[data-worker-buy]").addEventListener("click", () => dispatchGameAction("autoMiners/hire", { id: "surveyor" }));
}

function renderAutoQueueView() {
  boardElement.className = "auto-queue-list";
  boardElement.removeAttribute("style");
  boardElement.setAttribute("aria-label", "Auto Miner field queue");
  if (!autoMinersState.queue.length) {
    boardElement.innerHTML = '<p class="queue-empty">The Field Queue is empty</p>';
    return;
  }
  const workerNames = Object.fromEntries(SPECIALISTS.map((worker) => [worker.id, worker.name]));
  const assignments = Object.fromEntries(SPECIALISTS.map((worker) => [worker.id, []]));
  Object.entries(autoMinersState.workerFields).forEach(([id, field]) => {
    if (assignments[id] && field < autoMinersState.queue.length) assignments[id].push(field);
  });
  boardElement.innerHTML = autoMinersState.queue.map((field, index) => {
    const assigned = Object.entries(assignments)
      .filter(([, fields]) => fields.includes(index))
      .map(([id]) => workerNames[id]);
    const actualMines = field.board.filter((cell) => cell.mine).length;
    const openTiles = field.board.filter((cell) => cell.open).length;
    return `
      <article class="queued-field-card${index === 0 ? " is-front" : ""}">
        <div class="queued-field-card__topline"><strong>Field ${index + 1}${index === 0 ? " · FRONT" : ""}</strong><b>${field.settings.rows}×${field.settings.cols}</b></div>
        <p>${openTiles} open · ${actualMines} mines · ${assigned.length ? assigned.join(", ") : "No worker assigned"}</p>
      </article>
    `;
  }).join("");
}

function renderWorkerList(element, group) {
  const order = autoMinersState.initiative[group];
  element.innerHTML = order.map((id) => {
    const specialist = SPECIALISTS.find((worker) => worker.id === id);
    const level = specialistLevel(specialist.id);
    const implemented = specialist.id === "surveyor" || specialist.id === "excavator" || specialist.id === "flagbearer";
    const cost = workerCost(specialist);
    const affordable = specialist.currency === "coins" ? player.coins >= cost : player.mines >= cost;
    const status = level > 0 ? `LV ${level}` : specialist.id === "surveyor" ? "AVAILABLE" : "LOCKED";
    const available = specialist.id === "surveyor" || (implemented && specialistLevel("surveyor") > 0);
    const button = available
      ? `<button class="worker-buy" type="button" data-worker-buy="${specialist.id}" ${affordable ? "" : "disabled"}>${formatWorkerCost(specialist, cost)}</button>`
      : "";
    const cardClass = level > 0 ? "is-active" : available ? "is-available" : "is-locked";
    return `
      <article class="specialist-card ${cardClass}" draggable="true" data-worker-id="${specialist.id}">
        <div class="specialist-card__topline">
          <strong>${specialist.name}</strong>
          <b>${status}</b>
        </div>
        <p>${specialist.task}</p>
        ${button}
      </article>
    `;
  }).join("");
  element.querySelectorAll("[data-worker-buy]").forEach((button) => {
    button.addEventListener("click", () => dispatchGameAction("autoMiners/hire", { id: button.dataset.workerBuy }));
  });
  enableInitiativeDrag(element, group);
}

function workerCost(worker) {
  return calculateWorkerCost(worker, specialistLevel(worker.id));
}

function formatWorkerCost(worker, cost) {
  return worker.currency === "coins" ? `HIRE ${formatCurrency(cost)}` : `HIRE ${cost} MINE${cost === 1 ? "" : "S"}`;
}

function buyWorker(id) {
  const worker = SPECIALISTS.find((item) => item.id === id);
  const available = worker?.id === "surveyor" || (worker && ["excavator", "flagbearer"].includes(worker.id) && specialistLevel("surveyor") > 0);
  if (!worker || !available) return;
  const cost = workerCost(worker);
  if (worker.currency === "coins") {
    if (player.coins < cost) return;
    player.coins -= cost;
  } else {
    if (player.mines < cost) return;
    player.mines -= cost;
  }
  player.specialists[worker.id] = specialistLevel(worker.id) + 1;
  autoMinersState.statusText = `${worker.name} is now level ${player.specialists[worker.id]}.`;
  render();
}

function enableInitiativeDrag(element, group) {
  let draggedId = null;
  element.querySelectorAll("[data-worker-id]").forEach((card) => {
    card.addEventListener("dragstart", () => { draggedId = card.dataset.workerId; });
    card.addEventListener("dragover", (event) => event.preventDefault());
    card.addEventListener("drop", (event) => {
      event.preventDefault();
      const targetId = card.dataset.workerId;
      if (!draggedId || draggedId === targetId) return;
      dispatchGameAction("autoMiners/reorder", { group, draggedId, targetId });
    });
  });
}

function updateQuartermaster() {
  const tier = currentShovel();
  const shovelCost = shovelSupplyCost();
  const flagsCost = flagSupplyCost();
  const steelUnlocked = player.shovelTier >= 3;
  const mineTooltip = steelUnlocked ? COPY_CONFIG.tooltips.minesUnlocked : COPY_CONFIG.tooltips.minesLocked;
  if (player.mines > 0) player.specialEquipmentUnlocked = true;

  coinCountElement.textContent = formatCurrency(player.coins);
  shovelCountElement.textContent = String(player.shovels).padStart(2, "0");
  shovelUsesElement.textContent = `${player.shovelUses} digs`;
  flagStockElement.textContent = String(player.flags).padStart(2, "0");
  flagCapacityElement.textContent = `${flagCapacity()} max`;
  activeMineCountElement.textContent = String(player.mines).padStart(2, "0");
  mineResourceDetailElement.textContent = steelUnlocked ? `${Math.round(mineCollectionChance() * 100)}% recovery` : "locked";

  shovelResourceElement.dataset.tooltip = COPY_CONFIG.tooltips.shovel;
  flagResourceElement.dataset.tooltip = COPY_CONFIG.tooltips.flags;
  mineResourceElement.dataset.tooltip = mineTooltip;
  shovelResourceElement.setAttribute("aria-label", `Shovels: ${player.shovels} in stock. ${COPY_CONFIG.tooltips.shovel}.`);
  flagResourceElement.setAttribute("aria-label", `Flags: ${player.flags} in stock. ${COPY_CONFIG.tooltips.flags}.`);
  mineResourceElement.setAttribute("aria-label", mineTooltip);

  buyShovelCostElement.textContent = formatCurrency(shovelCost);
  buyFlagsCostElement.textContent = formatCurrency(flagsCost);
  buyShovelDetailElement.textContent = `+1 ${tier.name.toLowerCase()} shovel · ${shovelCapacity()} max`;
  buyShovelButton.disabled = !canPurchase() || player.coins < shovelCost || player.shovels >= shovelCapacity();
  buyFlagsButton.disabled = !canPurchase() || player.coins < flagsCost || player.flags >= flagCapacity();
  storeNoteElement.textContent = canPurchase()
    ? formatMessage("suppliesReady", { name: tier.name, durability: tier.durability })
    : formatMessage("suppliesLocked");
  updateSpecialEquipmentUI();
}

function updateSpecialEquipmentUI() {
  const unlocked = hasSpecialEquipmentAccess();
  const total = specialEquipmentTotal();
  specialEquipmentStoreElement.hidden = !unlocked;
  equipmentTotalElement.textContent = String(total);
  equipmentToggleButton.disabled = total <= 0;
  equipmentToggleButton.title = total > 0 ? "Special equipment inventory" : "No special equipment stocked";

  specialEquipmentListElement.innerHTML = SPECIAL_EQUIPMENT.map((item) => {
    const disabled = !canPurchase() || player.mines < item.cost;
    return `
      <button class="store-item store-item--compact special-equipment-buy" type="button" data-equipment-buy="${item.id}" ${disabled ? "disabled" : ""}>
        <span class="store-item__copy"><strong>${item.name}</strong><small>${item.description}</small></span>
        <span class="store-item__cost">${item.cost} mine${item.cost === 1 ? "" : "s"}</span>
      </button>
    `;
  }).join("");

  specialEquipmentListElement.querySelectorAll("[data-equipment-buy]").forEach((button) => {
    button.addEventListener("click", () => dispatchGameAction("equipment/buy", { id: button.dataset.equipmentBuy }));
  });

  equipmentInventoryListElement.innerHTML = SPECIAL_EQUIPMENT.map((item) => {
    const count = player.specialEquipment[item.id] || 0;
    const isSelected = selectedEquipmentId === item.id;
    const disabled = count <= 0 || gameOver || isRevealing || !minesPlaced;
    const tooltip = !minesPlaced
      ? "Dig one square before using special equipment; mines are placed after the first click."
      : item.description;
    const activeText = activeEquipmentStatus(item.id);
    return `
      <button class="equipment-inventory__item${isSelected ? " is-selected" : ""}" type="button" data-equipment-activate="${item.id}" data-tooltip="${tooltip}" ${disabled ? "disabled" : ""}>
        <span>
          <strong>${item.name}</strong>
          <small>${activeText || item.shortDescription}</small>
        </span>
        <b>${count}</b>
      </button>
    `;
  }).join("");

  equipmentInventoryListElement.querySelectorAll("[data-equipment-activate]").forEach((button) => {
    button.addEventListener("click", () => dispatchGameAction("equipment/activate", { id: button.dataset.equipmentActivate }));
  });
}

function activeEquipmentStatus(id) {
  if (id === "bombBot" && activeEquipment.bombBotUses > 0) return `${activeEquipment.bombBotUses} opens protected`;
  if (id === "mineEncapsulation" && activeEquipment.mineEncapsulationUses > 0) return `${activeEquipment.mineEncapsulationUses} flag attempts armed`;
  return "";
}

function hasSpecialEquipmentAccess() {
  return player.specialEquipmentUnlocked || player.mines > 0 || specialEquipmentTotal() > 0;
}

function specialEquipmentTotal() {
  return SPECIAL_EQUIPMENT.reduce((total, item) => total + (player.specialEquipment[item.id] || 0), 0);
}

function isUpgradeUnlocked(id) {
  const order = PROGRESSION_CONFIG.order;
  const index = order.indexOf(id);
  if (index < 0) return true;
  if (index === 0) return true;

  const previous = order[index - 1];
  return isProgressionMilestoneReached(previous);
}

function isProgressionMilestoneReached(id) {
  return {
    tallerGrid: player.tallerGridLevel >= 1,
    widerGrid: player.widerGridLevel >= 1,
    improveShovel: player.shovelTier >= 1,
    addMine: player.mineLevel >= 1,
    addTreasure: player.treasureLevel >= 1,
    mineYield: player.mineYieldLevel >= 1,
    treasureValue: player.treasureValueLevel >= 1,
    betterFlags: player.betterFlagsLevel >= 1,
  }[id] || false;
}

function progressionCost(id, level) {
  const item = PROGRESSION_CONFIG.items[id];
  return exponentialCost(item.baseCost, item.growth, level);
}

function updateProgressionUI() {
  const progressionLocked = !canPurchase();
  const showProgression = (element, visible, disabled) => {
    element.hidden = !visible;
    element.disabled = disabled;
  };

  const taller = PROGRESSION_CONFIG.items.tallerGrid;
  const tallerCost = progressionCost("tallerGrid", player.tallerGridLevel);
  showProgression(upgradeElements.tallerGrid, isUpgradeUnlocked("tallerGrid") && player.tallerGridLevel < GRID_LIMITS.max - GRID_LIMITS.min, progressionLocked || player.coins < tallerCost);
  upgradeElements.tallerGridTitle.textContent = taller.name;
  upgradeElements.tallerGridCost.textContent = formatCurrency(tallerCost);
  upgradeElements.tallerGridDetail.textContent = formatCopy(taller.description, { next: GRID_LIMITS.min + player.tallerGridLevel + 1 });

  const wider = PROGRESSION_CONFIG.items.widerGrid;
  const widerCost = progressionCost("widerGrid", player.widerGridLevel);
  showProgression(upgradeElements.widerGrid, isUpgradeUnlocked("widerGrid") && player.widerGridLevel < GRID_LIMITS.max - GRID_LIMITS.min, progressionLocked || player.coins < widerCost);
  upgradeElements.widerGridTitle.textContent = wider.name;
  upgradeElements.widerGridCost.textContent = formatCurrency(widerCost);
  upgradeElements.widerGridDetail.textContent = formatCopy(wider.description, { next: GRID_LIMITS.min + player.widerGridLevel + 1 });

  const shovelItem = PROGRESSION_CONFIG.items.improveShovel;
  const nextTier = BALANCE_CONFIG.shovel.tiers[player.shovelTier + 1];
  const shovelCost = progressionCost("improveShovel", player.shovelTier);
  showProgression(upgradeElements.improveShovel, isUpgradeUnlocked("improveShovel") && Boolean(nextTier), progressionLocked || !nextTier || player.coins < shovelCost);
  upgradeElements.upgradeTitle.textContent = shovelItem.name;
  upgradeElements.upgradeDetail.textContent = nextTier
    ? formatCopy(shovelItem.description, { current: currentShovel().name, next: nextTier.name })
    : formatCopy(shovelItem.finalDescription, { current: currentShovel().name });
  upgradeElements.upgradeCost.textContent = nextTier ? formatCurrency(shovelCost) : "MAX";

  const mineItem = PROGRESSION_CONFIG.items.addMine;
  const mineCost = progressionCost("addMine", player.mineLevel);
  showProgression(upgradeElements.addMine, isUpgradeUnlocked("addMine"), progressionLocked || player.coins < mineCost);
  upgradeElements.addMineCost.textContent = formatCurrency(mineCost);
  upgradeElements.addMineDetail.textContent = formatCopy(mineItem.description, { next: maxUnlockedMineCount() + 1 });

  const treasureItem = PROGRESSION_CONFIG.items.addTreasure;
  const treasureCost = progressionCost("addTreasure", player.treasureLevel);
  showProgression(upgradeElements.addTreasure, isUpgradeUnlocked("addTreasure"), progressionLocked || player.coins < treasureCost);
  upgradeElements.addTreasureCost.textContent = formatCurrency(treasureCost);
  upgradeElements.addTreasureDetail.textContent = treasureItem.description;

  const yieldItem = PROGRESSION_CONFIG.items.mineYield;
  const yieldCost = progressionCost("mineYield", player.mineYieldLevel);
  showProgression(upgradeElements.mineYield, isUpgradeUnlocked("mineYield"), progressionLocked || player.coins < yieldCost);
  upgradeElements.mineYieldCost.textContent = formatCurrency(yieldCost);
  upgradeElements.mineYieldDetail.textContent = `${yieldItem.description} +${Math.round(mineYieldPercent() * 100)}% per extra mine.`;

  const valueItem = PROGRESSION_CONFIG.items.treasureValue;
  const valueCost = progressionCost("treasureValue", player.treasureValueLevel);
  showProgression(upgradeElements.treasureValue, isUpgradeUnlocked("treasureValue"), progressionLocked || player.coins < valueCost);
  upgradeElements.treasureValueCost.textContent = formatCurrency(valueCost);
  upgradeElements.treasureValueDetail.textContent = `${valueItem.description} Average: ${formatCurrency(treasureAverage())}.`;

  const flagsItem = PROGRESSION_CONFIG.items.betterFlags;
  const flagsUpgradeCost = progressionCost("betterFlags", player.betterFlagsLevel);
  showProgression(upgradeElements.betterFlags, isUpgradeUnlocked("betterFlags"), progressionLocked || player.coins < flagsUpgradeCost);
  upgradeElements.betterFlagsCost.textContent = formatCurrency(flagsUpgradeCost);
  upgradeElements.betterFlagsDetail.textContent = `${flagsItem.description} Current recovery: ${Math.round(mineCollectionChance() * 100)}%.`;

  const shovelCap = shovelCapacity();
  const nextShovelCap = nextCapacity("shovel");
  const shovelCapCost = capacityUpgradeCost("shovel");
  showProgression(upgradeElements.shovelCap, Boolean(nextShovelCap), progressionLocked || player.coins < shovelCapCost);
  upgradeElements.shovelCapTitle.textContent = COPY_CONFIG.upgradeLabels.shovelLocker;
  upgradeElements.shovelCapCost.textContent = nextShovelCap ? formatCurrency(shovelCapCost) : "MAX";
  upgradeElements.shovelCapDetail.textContent = nextShovelCap ? `${shovelCap} → ${nextShovelCap} shovels` : "50 shovel maximum reached";

  const flagCap = flagCapacity();
  const nextFlagCap = nextCapacity("flags");
  const flagCapCost = capacityUpgradeCost("flags");
  showProgression(upgradeElements.flagCap, Boolean(nextFlagCap), progressionLocked || player.coins < flagCapCost);
  upgradeElements.flagCapTitle.textContent = COPY_CONFIG.upgradeLabels.flagLocker;
  upgradeElements.flagCapCost.textContent = nextFlagCap ? formatCurrency(flagCapCost) : "MAX";
  upgradeElements.flagCapDetail.textContent = nextFlagCap ? `${flagCap} → ${nextFlagCap} flags` : "500 flag maximum reached";

  const safetyCost = BALANCE_CONFIG.abilities.safetyRadiusCosts[player.safetyRadius];
  const safetyFitsCurrentBoard = maxMineCount(player.safetyRadius + 1) >= 1;
  showProgression(
    abilityElements.safetyRadius,
    true,
    progressionLocked || player.safetyRadius >= 5 || !safetyFitsCurrentBoard || player.coins < safetyCost,
  );
  abilityElements.safetyRadiusCost.textContent = player.safetyRadius < 5 ? formatCurrency(safetyCost) : "MAX";
  abilityElements.safetyRadiusDetail.textContent = player.safetyRadius >= 5
    ? formatMessage("safetyMax")
    : !safetyFitsCurrentBoard
      ? "Unlock: expand the board beyond 3×3."
      : `Radius ${player.safetyRadius} → ${player.safetyRadius + 1}; no mine near first click`;

  const chordingVisible = player.shovelTier >= 3;
  showProgression(abilityElements.chording, true, progressionLocked || !chordingVisible || (!player.chordingUnlocked && player.mines < BALANCE_CONFIG.abilities.chordingMineCost));
  abilityElements.chordingTitle.textContent = player.chordingUnlocked ? "Chording ready" : "Unlock Chording";
  abilityElements.chordingDetail.textContent = player.chordingUnlocked
    ? formatMessage("chordingReady")
    : !chordingVisible
      ? "Unlock: upgrade to a Steel Shovel."
      : formatMessage("chordingDescription");
  abilityElements.chordingCost.textContent = player.chordingUnlocked ? "READY" : `${BALANCE_CONFIG.abilities.chordingMineCost} mines`;
}

function updateStatsUI() {
  renderStatsLedger({
    stats: player.stats,
    gridElement: statsGridElement,
    fastestElement: fastestConfigsElement,
    formatCurrency,
    formatDuration,
  });
  const summary = summarizeDeveloperTelemetry(developerTelemetry);
  const current = developerTelemetry.currentRun;
  const developerEntries = [
    ["Runs recorded", summary.runsRecorded],
    ["Average board duration", formatOptionalDuration(summary.averageBoardDurationMs)],
    ["Current run reveals", current?.revealCount ?? 0],
    ["Current flags placed / removed", `${current?.flagPlacements ?? 0} / ${current?.flagRemovals ?? 0}`],
    ["Current chords used", current?.chordUses ?? 0],
    ["Mine-hit rate", formatPercent(summary.mineHitRate, 1)],
    ["Current shovels / durability consumed", `${current?.shovelsConsumed ?? 0} / ${current?.shovelDurabilityConsumed ?? 0}`],
    ["Current coins earned", formatCurrency(current?.coinsEarned ?? 0)],
    ["Current recovered mines earned", current?.recoveredMinesEarned ?? 0],
    ["Average contract completion", formatOptionalDuration(summary.averageContractCompletionTimeMs)],
    ["Current equipment use", formatCounterMap(current?.equipmentUses || {})],
    ["Boards abandoned", formatPercent(summary.abandonedBoardRate, 1)],
    ["Average time to first purchase", formatOptionalDuration(summary.averageTimeBeforeFirstPurchaseMs)],
    ["Current purchases", formatCounterMap(current?.purchases || {})],
  ];
  developerStatsGridElement.innerHTML = developerEntries.map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`).join("");
  developerStatsNoteElement.textContent = current
    ? `Current ${current.id}: ${current.board.rows}×${current.board.cols}, ${current.outcome.replace("_", " ")}. Raw records are stored in save JSON under developerTelemetry.`
    : "Raw records are stored in save JSON under developerTelemetry.";
}

function formatOptionalDuration(milliseconds) {
  return Number.isFinite(milliseconds) ? formatDuration(milliseconds) : "—";
}

function formatCounterMap(counts) {
  const entries = Object.entries(counts);
  return entries.length ? entries.map(([id, count]) => `${id}: ${count}`).join(", ") : "—";
}

function updateCurioUI() {
  renderCurioLedger({
    curios: player.curios,
    chance: curioChance(),
    itemCount: BALANCE_CONFIG.curio.itemCount,
    chanceElement: curioChanceElement,
    gridElement: curioGridElement,
    noteElement: curioNoteElement,
    formatPercent,
  });
}

function activeChallenges() {
  return player.messageBoard.challenges.filter((challenge) => challenge.expiresInMs > 0);
}

function challengeProperties(challenge) {
  const properties = [
    ["Size", challenge.sizeAny ? "Any" : `${challenge.rows}×${challenge.cols}+`],
    ["Mines", challenge.minesAny ? "Any" : `${challenge.minMines}+`],
    ["Reward", formatCurrency(challenge.rewardCoins)],
  ];

  if (challenge.type === "flagLimit") properties.splice(2, 0, ["Challenge", `No more than ${challenge.flagLimit} flag${challenge.flagLimit === 1 ? "" : "s"}`]);
  if (challenge.type === "noChording") properties.splice(2, 0, ["Challenge", "No chording"]);
  if (challenge.type === "speedClear") properties.splice(2, 0, ["Challenge", `${challenge.seconds}s or less`]);
  return properties;
}

function challengeMatchesClear(challenge, result) {
  return matchesChallengeClear(challenge, result);
}

function completeMatchingChallenges(result) {
  const completed = [];
  player.messageBoard.challenges = activeChallenges().filter((challenge) => {
    if (!challengeMatchesClear(challenge, result)) return true;
    completed.push(challenge);
    return false;
  });

  if (completed.length === 0) return "";

  const coins = completed.reduce((total, challenge) => total + challenge.rewardCoins, 0);
  player.coins += coins;
  recordDeveloperEvent(developerTelemetry, { type: "coinsEarned", count: coins });
  player.stats.coinsEarned += coins;
  player.stats.challengesCompleted += completed.length;
  player.stats.challengesWon += completed.length;
  saveMessageBoard();
  return completed.map((challenge) => formatMessage("challengeWon", {
    name: challenge.name,
    coins: formatCurrency(challenge.rewardCoins),
  })).join("");
}

function updateChallengeUI() {
  const messageBoard = player.messageBoard;
  const challenges = activeChallenges();

  challengeCountdownElement.textContent = challenges.length >= CHALLENGE_CONFIG.maxActive
    ? "Board full"
    : `Next in ${formatClock(messageBoard.nextChallengeInMs)}`;

  renderMessageBoardList();
}

function updateContractUI() {
  const contracts = player.contracts;
  const active = activeContractType();
  const offered = offeredContractTypes();

  document.body.classList.toggle("is-contract-running", Boolean(active));

  if (active) {
    contractCountdownElement.textContent = "in field";
  } else if (offered.length >= availableContractSlotCount()) {
    contractCountdownElement.textContent = "ready";
  } else {
    contractCountdownElement.textContent = `${contracts.boardsUntilNext} board${contracts.boardsUntilNext === 1 ? "" : "s"}`;
  }

  renderMessageBoardList();
  updateContractModal(active);
}

function renderMessageBoardList() {
  const tiles = [];
  const active = activeContractType();

  if (active) tiles.push(renderContractTile(active, "Active contract", false, settings.mines));
  offeredContractTypes().forEach((contractType) => {
    tiles.push(renderContractTile(contractType, "Offer ready", !active));
  });

  activeChallenges().forEach((challenge) => {
    tiles.push(renderChallengeTile(challenge));
  });

  messageBoardListElement.innerHTML = tiles.join("");
}

function renderContractTile(contractType, status, canAccept, mineCount = null) {
  const properties = contractProperties(contractType, mineCount)
    .map(renderMessageTileProperty)
    .join("");
  const disabled = !canAccept || !hasContractDigCapacity(contractType);
  const title = canAccept && !hasContractDigCapacity(contractType)
    ? contractDigCapacityMessage(contractType)
    : "";
  const action = canAccept
    ? `<button class="contract-button message-tile__button js-start-contract" type="button" data-contract-id="${contractType.id}"${disabled ? " disabled" : ""}${title ? ` title="${title}"` : ""}>Accept</button>`
    : "";

  return `
    <article class="message-tile message-tile--contract">
      <div class="message-tile__topline">
        <div>
          <span class="message-tile__kind">Contract</span>
          <strong>${contractType.name}</strong>
        </div>
        <span>${status}</span>
      </div>
      <p>${contractType.description}</p>
      <div class="message-tile__properties">${properties}</div>
      ${action}
    </article>
  `;
}

function renderChallengeTile(challenge) {
  const properties = challengeProperties(challenge)
    .map(renderMessageTileProperty)
    .join("");

  return `
    <article class="message-tile message-tile--challenge">
      <div class="message-tile__topline">
        <div>
          <span class="message-tile__kind">Challenge</span>
          <strong>${challenge.name}</strong>
        </div>
        <span>${formatClock(challenge.expiresInMs)}</span>
      </div>
      <div class="message-tile__properties">${properties}</div>
    </article>
  `;
}

function renderMessageTileProperty([label, value]) {
  return `<span><strong>${label}</strong>${value}</span>`;
}

function updateContractModal(contractType) {
  if (!contractType || !player.contracts.active?.briefingOpen) {
    contractModalElement.hidden = true;
    return;
  }

  contractModalElement.hidden = false;
  contractModalLabelElement.textContent = "Contract accepted";
  contractModalTitleElement.textContent = contractType.name;
  contractModalDescriptionElement.textContent = contractType.description;
  contractModalFieldElement.textContent = `${contractType.rows}×${contractType.cols}`;
  contractModalMinesElement.textContent = `${settings.mines}`;
  contractModalRewardElement.textContent = `${formatCurrency(contractType.rewardCoins)} + ${contractType.rewardMines} mines`;
  contractModalDigsElement.textContent = `${player.shovelUses}/${contractDigRequirement(contractType)} digs`;
  contractModalFlagsElement.textContent = `${contractType.mines.max}`;
}

function acceptOfferedContract(contractId) {
  const contractType = offeredContractTypes().find((type) => type.id === contractId);
  if (!contractType || isContractActive()) return;
  if (!hasContractDigCapacity(contractType)) {
    statusElement.textContent = contractDigCapacityMessage(contractType);
    render();
    return;
  }

  const mineCount = randomInteger(contractType.mines.min, contractType.mines.max);
  player.contracts.active = {
    id: contractType.id,
    previousSettings: { ...settings },
    briefingOpen: true,
  };
  player.contracts.offeredIds = offeredContractIds().filter((id) => id !== contractType.id);
  settings = {
    rows: contractType.rows,
    cols: contractType.cols,
    mines: mineCount,
  };
  contractModalElement.hidden = true;
  startGame();
  statusElement.textContent = formatMessage("contractStarted", { name: contractType.name });
  render();
}

function closeContractBriefing() {
  if (!player.contracts.active) return;
  player.contracts.active.briefingOpen = false;
  contractModalElement.hidden = true;
  render();
}

function activeContractType() {
  return player.contracts.active ? contractTypeById(player.contracts.active.id) : null;
}

function offeredContractIds() {
  if (Array.isArray(player.contracts.offeredIds)) {
    return [...new Set(player.contracts.offeredIds)].filter((id) => contractTypeById(id));
  }
  return player.contracts.offeredId && contractTypeById(player.contracts.offeredId)
    ? [player.contracts.offeredId]
    : [];
}

function offeredContractTypes() {
  return offeredContractIds().map(contractTypeById).filter(Boolean);
}

function contractTypeById(id) {
  return findContractType(CONTRACT_CONFIG.types, id);
}

function isContractActive() {
  return Boolean(player.contracts.active);
}

function isContractBoardDisplayed() {
  return isContractActive() || Boolean(player.contracts.returnSettings);
}

function contractSummary(contractType, mineCount = null) {
  const mines = mineCount || `${contractType.mines.min}-${contractType.mines.max}`;
  return `${contractType.rows}×${contractType.cols}, ${mines} mines, ${formatCurrency(contractType.rewardCoins)} + ${contractType.rewardMines} mine reward.`;
}

function contractProperties(contractType, mineCount = null) {
  const mines = mineCount || `${contractType.mines.min}-${contractType.mines.max}`;
  return [
    ["Field", `${contractType.rows}×${contractType.cols}`],
    ["Mines", mines],
    ["Reward", `${formatCurrency(contractType.rewardCoins)} + ${contractType.rewardMines} mine${contractType.rewardMines === 1 ? "" : "s"}`],
    ["Digs", contractDigRequirement(contractType)],
    ["Flags", contractType.mines.max],
  ];
}

function contractCapacitySummary(contractType) {
  return `Requires ${contractDigRequirement(contractType)} digs; you have ${player.shovelUses}.`;
}

function contractDigRequirement(contractType) {
  return calculateContractDigRequirement(contractType, BALANCE_CONFIG.digCostPerTile);
}

function hasContractDigCapacity(contractType) {
  return player.shovelUses >= contractDigRequirement(contractType);
}

function contractDigCapacityMessage(contractType) {
  return formatMessage("contractNeedsShovels", {
    name: contractType.name,
    needed: contractDigRequirement(contractType),
    available: player.shovelUses,
  });
}

function advanceContractSchedule() {
  const contracts = player.contracts;
  if (contracts.active || availableContractTypes().length === 0) return;

  contracts.boardsUntilNext = Math.max(0, contracts.boardsUntilNext - 1);
  if (contracts.boardsUntilNext > 0) return;

  const offer = rollContractOffer();
  if (!offer) {
    contracts.boardsUntilNext = randomContractDelay();
    return;
  }

  addContractOffer(offer.id);
  contracts.boardsUntilNext = randomContractDelay();
  statusElement.textContent = formatMessage("contractReady", { name: offer.name });
}

function rollContractOffer(ignoreCooldowns = false) {
  const available = availableContractTypes(ignoreCooldowns);
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

function availableContractTypes(ignoreCooldowns = false) {
  return listAvailableContracts(
    CONTRACT_CONFIG.types,
    player.contracts,
    offeredContractIds(),
    ignoreCooldowns,
  );
}

function availableContractSlotCount() {
  return CONTRACT_CONFIG.types
    .slice(0, player.contracts.unlockedTypeCount)
    .filter((type) => !player.contracts.active || player.contracts.active.id !== type.id)
    .length;
}

function addContractOffer(contractId) {
  player.contracts.offeredIds = [...new Set([...offeredContractIds(), contractId])];
}

function generateContractOffer() {
  if (isContractActive()) {
    statusElement.textContent = "Finish the active contract before posting another one.";
    return;
  }

  const offer = rollContractOffer(true);
  if (!offer) {
    statusElement.textContent = "All available contract types are already posted.";
    updateContractUI();
    return;
  }

  addContractOffer(offer.id);
  statusElement.textContent = formatMessage("contractReady", { name: offer.name });
  updateContractUI();
}

function completeContract(contractType) {
  const contracts = player.contracts;
  const typeIndex = CONTRACT_CONFIG.types.indexOf(contractType);
  const previousSettings = contracts.active?.previousSettings || { ...DEFAULT_SETTINGS };

  player.coins += contractType.rewardCoins;
  recordDeveloperEvent(developerTelemetry, { type: "coinsEarned", count: contractType.rewardCoins });
  player.mines += contractType.rewardMines;
  recordDeveloperEvent(developerTelemetry, { type: "recoveredMines", count: contractType.rewardMines });
  player.stats.coinsEarned += contractType.rewardCoins;
  player.stats.contractsCompleted += 1;
  player.stats.contractsWon += 1;
  if (typeIndex >= 0) {
    contracts.completedByType[typeIndex] += 1;
    if (contracts.completedByType[typeIndex] === 1 && typeIndex + 1 === contracts.unlockedTypeCount) {
      contracts.unlockedTypeCount = Math.min(CONTRACT_CONFIG.types.length, contracts.unlockedTypeCount + 1);
    }
  }

  contracts.active = null;
  contracts.boardsUntilNext = randomContractDelay();
  contracts.returnSettings = previousSettings;
  document.body.classList.remove("is-contract-running");
  return formatMessage("contractWon", {
    name: contractType.name,
    coins: formatCurrency(contractType.rewardCoins),
    mines: contractType.rewardMines,
    plural: contractType.rewardMines === 1 ? "" : "s",
  });
}

function failContract(contractType) {
  const contracts = player.contracts;
  const typeIndex = CONTRACT_CONFIG.types.indexOf(contractType);
  const previousSettings = contracts.active?.previousSettings || { ...DEFAULT_SETTINGS };

  if (typeIndex >= 0) contracts.cooldowns[typeIndex] = CONTRACT_CONFIG.lossCooldownGames;
  player.stats.contractsLost += 1;
  contracts.active = null;
  contracts.boardsUntilNext = randomContractDelay();
  contracts.returnSettings = previousSettings;
  document.body.classList.remove("is-contract-running");
  return formatMessage("contractLost", {
    name: contractType.name,
    count: CONTRACT_CONFIG.lossCooldownGames,
  });
}

function tickContractCooldowns() {
  player.contracts.cooldowns = decreaseContractCooldowns(player.contracts.cooldowns);
}

function randomContractDelay() {
  return randomInteger(CONTRACT_CONFIG.minBoardsBetween, CONTRACT_CONFIG.maxBoardsBetween);
}

function tickMessageBoard() {
  const now = performance.now();
  const elapsed = now - lastChallengeTickTime;
  lastChallengeTickTime = now;
  if (document.visibilityState === "hidden" || elapsed <= 0) {
    updateChallengeUI();
    return;
  }

  player.messageBoard = advanceChallengeTimers(player.messageBoard, elapsed, CHALLENGE_CONFIG.maxActive);
  const messageBoard = player.messageBoard;

  if (messageBoard.challenges.length < CHALLENGE_CONFIG.maxActive) {
    if (messageBoard.nextChallengeInMs <= 0) {
      const challenge = createChallengeOffer();
      messageBoard.challenges.push(challenge);
      messageBoard.nextChallengeInMs = randomChallengeDelayMs();
      statusElement.textContent = formatMessage("challengeReady", { name: challenge.name });
    }
  }

  saveMessageBoard();
  updateChallengeUI();
}

function createChallengeOffer() {
  const type = CHALLENGE_CONFIG.types[Math.floor(Math.random() * CHALLENGE_CONFIG.types.length)];
  const maxRows = GRID_LIMITS.min + player.tallerGridLevel;
  const maxCols = GRID_LIMITS.min + player.widerGridLevel;
  const maxMines = Math.max(1, Math.min(maxUnlockedMineCount(), maxMineCountFor(maxRows, maxCols, player.safetyRadius)));
  const sizeAny = Math.random() < CHALLENGE_CONFIG.sizeAnyChance;
  const minesAny = Math.random() < CHALLENGE_CONFIG.mineAnyChance;
  const rows = sizeAny ? null : randomInteger(GRID_LIMITS.min, maxRows);
  const cols = sizeAny ? null : randomInteger(GRID_LIMITS.min, maxCols);
  const boardTileCount = sizeAny ? maxRows * maxCols : rows * cols;
  const possibleMines = sizeAny
    ? maxMines
    : Math.max(1, Math.min(maxMines, maxMineCountFor(rows, cols, player.safetyRadius)));
  const minMines = minesAny ? null : randomInteger(1, possibleMines);
  const expiresInMs = randomChallengeLifetimeMs();
  const rewardCoins = challengeRewardCoins(type, boardTileCount, minMines || Math.max(1, Math.floor(maxMines / 2)));
  const challenge = {
    id: messageBoardChallengeId(),
    type: type.id,
    name: type.name,
    sizeAny,
    minesAny,
    rows,
    cols,
    minMines,
    rewardCoins,
    expiresInMs,
  };

  if (type.id === "flagLimit") challenge.flagLimit = randomInteger(0, Math.max(0, Math.min(8, minMines || possibleMines)));
  if (type.id === "speedClear") challenge.seconds = type.seconds;
  return challenge;
}

function generateChallengeOffer() {
  const challenges = activeChallenges();
  if (challenges.length >= CHALLENGE_CONFIG.maxActive) {
    player.messageBoard.challenges = challenges;
    statusElement.textContent = "The message board is full.";
    updateChallengeUI();
    return;
  }

  const challenge = createChallengeOffer();
  player.messageBoard.challenges = [...challenges, challenge];
  player.messageBoard.nextChallengeInMs = randomChallengeDelayMs();
  saveMessageBoard();
  statusElement.textContent = formatMessage("challengeReady", { name: challenge.name });
  updateChallengeUI();
}

function messageBoardChallengeId() {
  const id = player.messageBoard.nextChallengeId;
  player.messageBoard.nextChallengeId += 1;
  return id;
}

function challengeRewardCoins(type, tileCount, mines) {
  const difficultyMultiplier = {
    flagLimit: 1.15,
    noChording: 1,
    speedClear: 1.35,
  }[type.id] || 1;
  return Math.round((CHALLENGE_CONFIG.rewardBaseCoins
    + tileCount * CHALLENGE_CONFIG.rewardCoinsPerTile
    + mines * CHALLENGE_CONFIG.rewardCoinsPerMine) * difficultyMultiplier);
}

function randomChallengeDelayMs() {
  return randomInteger(CHALLENGE_CONFIG.minSecondsBetween, CHALLENGE_CONFIG.maxSecondsBetween) * 1000;
}

function randomChallengeLifetimeMs() {
  const steps = (CHALLENGE_CONFIG.maxLifetimeSeconds - CHALLENGE_CONFIG.minLifetimeSeconds) / CHALLENGE_CONFIG.lifetimeStepSeconds;
  return (CHALLENGE_CONFIG.minLifetimeSeconds + randomInteger(0, steps) * CHALLENGE_CONFIG.lifetimeStepSeconds) * 1000;
}

function maxMineCountFor(rows, cols, safetyRadius = 0) {
  const safeAreaWidth = Math.min(cols, safetyRadius * 2 + 1);
  const safeAreaHeight = Math.min(rows, safetyRadius * 2 + 1);
  return Math.max(1, rows * cols - safeAreaWidth * safeAreaHeight);
}

function syncSettingsControls() {
  rebuildSelect(rowsInput, availableRows(), (value) => `${value} rows`);
  rebuildSelect(colsInput, availableCols(), (value) => `${value} columns`);
  rebuildSelect(minesInput, availableMines(), (value) => `${value} mine${value === 1 ? "" : "s"}`);
  rowsInput.value = String(settings.rows);
  colsInput.value = String(settings.cols);
  minesInput.value = String(settings.mines);
  const locked = isContractBoardDisplayed() || (roundStarted && !gameOver);
  rowsInput.disabled = locked;
  colsInput.disabled = locked;
  minesInput.disabled = locked;
}

function rebuildSelect(select, values, label) {
  const current = select.value;
  select.innerHTML = "";
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = label(value);
    select.append(option);
  });
  if (values.some((value) => String(value) === current)) select.value = current;
}

function applySettingsFromControls() {
  if (isContractBoardDisplayed()) {
    statusElement.textContent = formatMessage("finishRound");
    syncSettingsControls();
    return;
  }
  if (roundStarted && !gameOver) {
    statusElement.textContent = formatMessage("finishRound");
    syncSettingsControls();
    return;
  }
  settings.rows = Number.parseInt(rowsInput.value, 10);
  settings.cols = Number.parseInt(colsInput.value, 10);
  settings.mines = Number.parseInt(minesInput.value, 10);
  startGame();
}

function currentShovel() {
  return BALANCE_CONFIG.shovel.tiers[player.shovelTier];
}

function shovelCapacity() {
  return BALANCE_CONFIG.capacity.shovel[player.shovelCapacityLevel];
}

function flagCapacity() {
  return BALANCE_CONFIG.capacity.flags[player.flagCapacityLevel];
}

function nextCapacity(kind) {
  const levels = kind === "shovel" ? BALANCE_CONFIG.capacity.shovel : BALANCE_CONFIG.capacity.flags;
  const level = kind === "shovel" ? player.shovelCapacityLevel : player.flagCapacityLevel;
  return levels[level + 1] || null;
}

function capacityUpgradeCost(kind) {
  const costs = kind === "shovel" ? BALANCE_CONFIG.upgrades.shovelCapacityCosts : BALANCE_CONFIG.upgrades.flagCapacityCosts;
  const level = kind === "shovel" ? player.shovelCapacityLevel : player.flagCapacityLevel;
  return costs[level] || 0;
}

function shovelSupplyCost() {
  return Math.ceil(BALANCE_CONFIG.shovel.supplyCost * BALANCE_CONFIG.shovel.supplyCostMultiplierPerTier ** player.shovelTier);
}

function flagSupplyCost() {
  return Math.ceil(BALANCE_CONFIG.shovel.flagSupplyCost * (1 + player.betterFlagsLevel * 0.5));
}

function shovelUpgradeCost() {
  return progressionCost("improveShovel", player.shovelTier);
}

function mineCollectionChance() {
  if (player.shovelTier < 3) return 0;
  const tierBonus = (player.shovelTier - 3) * BALANCE_CONFIG.mineCollection.betterShovelChancePerTier;
  const flagBonus = player.betterFlagsLevel * BALANCE_CONFIG.upgrades.betterFlagsChancePerLevel;
  return Math.min(1, BALANCE_CONFIG.mineCollection.steelBaseChance + tierBonus + flagBonus);
}

function mineYieldPercent() {
  return 0.01 + player.mineYieldLevel * BALANCE_CONFIG.upgrades.mineYieldPercentPerLevel;
}

function treasureAverage() {
  const minimum = BALANCE_CONFIG.treasure.startingMinimumCoins + player.treasureValueLevel * BALANCE_CONFIG.treasure.minimumGrowth;
  const maximum = BALANCE_CONFIG.treasure.startingMaximumCoins + player.treasureValueLevel * BALANCE_CONFIG.treasure.maximumGrowth;
  return Math.round((minimum + maximum) / 2);
}

function curioChance() {
  const curio = BALANCE_CONFIG.curio;
  const misses = Math.max(0, player.curioMisses);
  return curio.maxChance - ((curio.maxChance - curio.baseChance) * curio.missDecay ** misses);
}

function upgradeLabel(id) {
  return PROGRESSION_CONFIG.items[id]?.name || "Upgrade";
}

function exponentialCost(base, growth, step) {
  return calculateExponentialCost(base, growth, step);
}

function formatCurrency(value) {
  return formatCurrencyValue(value, BALANCE_CONFIG.currencySymbol);
}

function grantDebugCoins() {
  player.coins += 10000;
  player.mines += 5;
  render();
}

function formatPercent(value, decimals = 0) {
  return `${(value * 100).toFixed(decimals)}%`;
}

function formatDuration(milliseconds) {
  return `${(milliseconds / 1000).toFixed(2)}s`;
}

function formatClock(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function randomInteger(minimum, maximum) {
  return chooseRandomInteger(minimum, maximum, () => Math.random());
}

function clamp(value, min, max) {
  return clampValue(value, min, max);
}

function activateBoardCell(index) {
  const cell = board[index];
  if (!cell) return;
  const isAutoMode = currentMode === GAME_MODES.autoMiners;
  if (cell.open && cell.adjacent > 0 && (isAutoMode || player.chordingUnlocked)) {
    chordCell(index);
    return;
  }
  if (!isAutoMode && selectedEquipmentId) {
    useSelectedEquipment(index);
    return;
  }
  if (!cell.open) openCell(index);
}

function reorderInitiative({ group, draggedId, targetId }) {
  if (!autoMinersState || !draggedId || draggedId === targetId) return;
  const order = autoMinersState.initiative[group];
  if (!Array.isArray(order)) return;
  const from = order.indexOf(draggedId);
  const to = order.indexOf(targetId);
  if (from < 0 || to < 0) return;
  order.splice(from, 1);
  order.splice(to, 0, draggedId);
  render();
}

function reduceRuntimeAction(state, action) {
  if (action.type === "replaceState") return action.state;
  const handler = GAME_ACTION_HANDLERS[action.type];
  if (!handler) return state;
  handler(action.payload || {});
  const snapshot = captureGameState();
  return {
    state: snapshot,
    effects: [{ type: "notice", notice: { code: "literal", args: { text: statusElement.textContent } } }],
  };
}

const GAME_ACTION_HANDLERS = {
  "board/activate": ({ index }) => activateBoardCell(index),
  "board/flag": ({ index }) => toggleFlag(index),
  "settings/change": applySettingsFromControls,
  "supplies/buyShovel": buyShovel,
  "supplies/buyFlags": buyFlags,
  "equipment/toggle": () => {
    if (specialEquipmentTotal() <= 0) return;
    equipmentInventoryElement.hidden = !equipmentInventoryElement.hidden;
    equipmentToggleButton.setAttribute("aria-expanded", String(!equipmentInventoryElement.hidden));
  },
  "equipment/buy": ({ id }) => buySpecialEquipment(id),
  "equipment/activate": ({ id }) => activateEquipment(id),
  "progression/improveShovel": improveShovel,
  "progression/buy": ({ id }) => buyUpgrade(id),
  "progression/capacity": ({ kind }) => buyCapacityUpgrade(kind),
  "abilities/buy": ({ id }) => buyAbility(id),
  "contracts/accept": ({ id }) => acceptOfferedContract(id),
  "contracts/generate": generateContractOffer,
  "contracts/closeBriefing": closeContractBriefing,
  "challenges/generate": generateChallengeOffer,
  "autoMiners/showQueue": showAutoQueueList,
  "autoMiners/showField": switchToAutoMiners,
  "autoMiners/survey": surveyNow,
  "autoMiners/hire": ({ id }) => buyWorker(id),
  "autoMiners/reorder": reorderInitiative,
  "autoMiners/dismissClear": () => {
    fieldClearModalElement.hidden = true;
    if (currentMode === GAME_MODES.autoMiners) {
      loadAutoActiveField();
      render();
    }
  },
  "round/reset": () => {
    if (currentMode === GAME_MODES.autoMiners) switchToFieldQueue();
    else startGame();
  },
  "progress/reset": resetProgress,
  "debug/grantCoins": grantDebugCoins,
  "timers/tick": () => {
    tickMessageBoard();
    tickAutoMiners();
  },
};

rowsInput.addEventListener("change", () => dispatchGameAction("settings/change"));
colsInput.addEventListener("change", () => dispatchGameAction("settings/change"));
minesInput.addEventListener("change", () => dispatchGameAction("settings/change"));
buyShovelButton.addEventListener("click", () => dispatchGameAction("supplies/buyShovel"));
buyFlagsButton.addEventListener("click", () => dispatchGameAction("supplies/buyFlags"));
equipmentToggleButton.addEventListener("click", () => dispatchGameAction("equipment/toggle"));
upgradeElements.improveShovel.addEventListener("click", () => dispatchGameAction("progression/improveShovel"));
upgradeElements.addMine.addEventListener("click", () => dispatchGameAction("progression/buy", { id: "addMine" }));
upgradeElements.addTreasure.addEventListener("click", () => dispatchGameAction("progression/buy", { id: "addTreasure" }));
upgradeElements.treasureValue.addEventListener("click", () => dispatchGameAction("progression/buy", { id: "treasureValue" }));
upgradeElements.betterFlags.addEventListener("click", () => dispatchGameAction("progression/buy", { id: "betterFlags" }));
upgradeElements.mineYield.addEventListener("click", () => dispatchGameAction("progression/buy", { id: "mineYield" }));
upgradeElements.shovelCap.addEventListener("click", () => dispatchGameAction("progression/capacity", { kind: "shovel" }));
upgradeElements.flagCap.addEventListener("click", () => dispatchGameAction("progression/capacity", { kind: "flags" }));
upgradeElements.tallerGrid.addEventListener("click", () => dispatchGameAction("progression/buy", { id: "tallerGrid" }));
upgradeElements.widerGrid.addEventListener("click", () => dispatchGameAction("progression/buy", { id: "widerGrid" }));
abilityElements.safetyRadius.addEventListener("click", () => dispatchGameAction("abilities/buy", { id: "safetyRadius" }));
abilityElements.chording.addEventListener("click", () => dispatchGameAction("abilities/buy", { id: "chording" }));
messageBoardListElement.addEventListener("click", (event) => {
  const button = event.target.closest(".js-start-contract");
  if (button) dispatchGameAction("contracts/accept", { id: button.dataset.contractId });
});
fieldQueueButton.addEventListener("click", () => dispatchGameAction("autoMiners/showQueue"));
autoMinersButton.addEventListener("click", () => dispatchGameAction("autoMiners/showField"));
generateContractButton.addEventListener("click", () => dispatchGameAction("contracts/generate"));
generateChallengeButton.addEventListener("click", () => dispatchGameAction("challenges/generate"));
surveyNowButton.addEventListener("click", () => dispatchGameAction("autoMiners/survey"));
contractModalStartButton.addEventListener("click", () => dispatchGameAction("contracts/closeBriefing"));
fieldClearModalDismissButton.addEventListener("click", () => dispatchGameAction("autoMiners/dismissClear"));
resetButton.addEventListener("click", () => dispatchGameAction("round/reset"));
resetProgressButton.addEventListener("click", () => dispatchGameAction("progress/reset"));
window.addEventListener("keydown", (event) => {
  if (event.shiftKey && event.key.toLowerCase() === "g") {
    event.preventDefault();
    dispatchGameAction("debug/grantCoins");
  }
});
function initializeApplication() {
  bindSaveControls({
    captureState: captureGameState,
    replaceState: (state) => {
      saveReady = true;
      replaceGameState(state);
      stateEngine.dispatch({ type: "replaceState", state });
      saveNow();
    },
    showNotice: showSaveNotice,
  });

  let restored = null;
  let restoreFailed = false;
  try {
    restored = loadStoredSave();
  } catch (error) {
    restoreFailed = true;
    showSaveNotice(`Saved data could not be loaded: ${error.message}`);
  }

  if (restored) replaceGameState(restored);
  else startGame();

  saveReady = !restoreFailed;
  if (saveReady) saveNow();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveNow();
  });
  window.addEventListener("beforeunload", saveNow);
  window.setInterval(() => dispatchGameAction("timers/tick", { deltaMs: 1000 }), 1000);
}

initializeApplication();
