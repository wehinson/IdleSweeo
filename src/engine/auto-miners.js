export function createAutoMinerState(specialists, now = 0) {
  return {
    automationMode: "manual",
    queue: [],
    // -1 denotes the visible, player-facing board. Non-negative values refer
    // to queued fields.
    workerFields: Object.fromEntries(specialists.map((worker) => [worker.id, -1])),
    workerPolicies: Object.fromEntries(specialists
      .filter((worker) => worker.group === "agents")
      .map((worker) => [worker.id, "focus"])),
    initiative: {
      agents: ["excavator", "flagbearer"],
      specialists: specialists.filter((worker) => worker.group === "specialists").map((worker) => worker.id),
    },
    workerTasks: {},
    lastSurveyAt: now,
    lastWorkerTickAt: 0,
    statusText: "Hire a Surveyor to begin building the Field Queue.",
  };
}

export function workerCost(worker, level) {
  return Math.ceil(worker.baseCost * 1.6 ** level);
}

export function surveyorIntervalMs(level) {
  if (level <= 1) return 60000;
  return Math.max(5000, Math.round(60000 / (1 + (level - 1) * 0.16)));
}
