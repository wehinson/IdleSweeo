export function createAutoMinerState(specialists, now = 0) {
  return {
    queue: [],
    workerFields: Object.fromEntries(specialists.map((worker) => [worker.id, 0])),
    initiative: {
      agents: ["excavator", "flagbearer"],
      specialists: specialists.filter((worker) => worker.group === "specialists").map((worker) => worker.id),
    },
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
