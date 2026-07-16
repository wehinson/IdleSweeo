export const GAME_MODES = Object.freeze({
  fieldQueue: "fieldQueue",
  autoMiners: "autoMiners",
});

export const SPECIAL_EQUIPMENT = Object.freeze([
  { id: "probeCharge", name: "Probe Charge", cost: 1, shortDescription: "Scan one hidden square", description: "Reveals whether a selected square contains a mine without overturning it." },
  { id: "controlledBlast", name: "Controlled Blast", cost: 3, shortDescription: "Open a 3x3 region", description: "Opens a 3x3 region. Mines inside are safely destroyed and cannot be collected." },
  { id: "seismicTrap", name: "Seismic Trap", cost: 4, shortDescription: "Count row and column mines", description: "Shows the total number of mines in the selected square's row and column." },
  { id: "bombBot", name: "Bomb-Bot", cost: 5, shortDescription: "Protects the next 15 opens", description: "For the next 15 opened squares in a round, one explosion destroys the bot instead of ending the round." },
  { id: "mineEncapsulation", name: "Mine Encapsulation", cost: 10, shortDescription: "Collect flagged mines for 20 flags", description: "For the next 20 flag attempts in a round, correct flags collect mines and false flags uncover the tile." },
]);

export const SPECIALISTS = Object.freeze([
  { id: "surveyor", name: "Surveyor", group: "queue", currency: "coins", baseCost: 100, task: "Finds a field on a timer and opens its first safe area. Level 10 opens 3x3; level 20 opens 5x5." },
  { id: "excavator", name: "Excavator", group: "agents", currency: "coins", baseCost: 150, task: "From top-left, opens one tile beside a number already touching enough flags." },
  { id: "flagbearer", name: "Flagbearer", group: "agents", currency: "coins", baseCost: 180, task: "From bottom-left, places one certain flag when all remaining neighbors must be mines." },
  { id: "depthAnalyst", name: "Depth Analyst", group: "specialists", currency: "mines", baseCost: 5, task: "Looks for safe chording opportunities from the bottom-right." },
  { id: "prospector", name: "Prospector", group: "specialists", currency: "mines", baseCost: 6, task: "Checks one row per pass for treasure chests." },
  { id: "tunneller", name: "Tunneller", group: "specialists", currency: "mines", baseCost: 8, task: "Solves one 1-2-1 pattern per pass." },
  { id: "foreman", name: "Foreman", group: "specialists", currency: "mines", baseCost: 10, task: "Solves one 1-2-2-1 pattern per pass." },
  { id: "coordinator", name: "Coordinator", group: "specialists", currency: "mines", baseCost: 12, task: "Finds 1-2-x mine patterns." },
  { id: "pathfinder", name: "Pathfinder", group: "specialists", currency: "mines", baseCost: 15, task: "Finds border-based 1-1-x patterns, improving at levels 5 and 10." },
]);

export const SPECIAL_EQUIPMENT_BY_ID = Object.freeze(Object.fromEntries(SPECIAL_EQUIPMENT.map((item) => [item.id, item])));
