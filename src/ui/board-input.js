export function createCellInputController({ longPressMs = 450 } = {}) {
  let longPressTimer = null;
  let ignoreNextClick = false;

  function cancel() {
    if (longPressTimer !== null) {
      window.clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function bind(button, { onActivate, onFlag, enableLongPress = true }) {
    button.addEventListener("click", () => {
      if (ignoreNextClick) {
        ignoreNextClick = false;
        return;
      }
      onActivate();
    });
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      onFlag();
    });
    button.addEventListener("pointerdown", () => {
      if (!enableLongPress) return;
      cancel();
      longPressTimer = window.setTimeout(() => {
        onFlag();
        ignoreNextClick = true;
        longPressTimer = null;
      }, longPressMs);
    });
    button.addEventListener("pointerup", cancel);
    button.addEventListener("pointerleave", cancel);
    button.addEventListener("pointercancel", cancel);
  }

  return { bind, cancel };
}
