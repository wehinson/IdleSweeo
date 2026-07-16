export function encodeModeState(state, now) {
  if (!state) return null;
  const roundElapsedMs = state.roundStarted
    ? Math.max(0, now - (Number.isFinite(state.roundStartTime) ? state.roundStartTime : now))
    : 0;
  const encoded = {
    ...state,
    roundElapsedMs,
    recentlyRevealed: Array.from(state.recentlyRevealed || []),
    treasurePopups: Array.from(state.treasurePopups || []),
    notice: { code: "literal", args: { text: state.statusText || "" } },
    controls: { resetText: state.resetText || "READY" },
  };
  delete encoded.roundStartTime;
  delete encoded.statusText;
  delete encoded.resetText;
  return encoded;
}

export function decodeModeState(state, now) {
  if (!state) return null;
  const decoded = {
    ...state,
    roundStartTime: state.roundStarted ? now - state.roundElapsedMs : 0,
    recentlyRevealed: new Set(state.recentlyRevealed || []),
    treasurePopups: new Map(state.treasurePopups || []),
    statusText: state.notice?.args?.text || "",
    resetText: state.controls?.resetText || "READY",
  };
  delete decoded.roundElapsedMs;
  delete decoded.notice;
  delete decoded.controls;
  return decoded;
}
