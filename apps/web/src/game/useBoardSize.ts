import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { BOARD_SIZE_STEP, MIN_BOARD_SIZE, readBoardSize, snapBoardSize, writeBoardSize } from "./displayPrefs.js";

/** With less spare range than this the board already fills the window, so resizing controls would do nothing useful. */
const MIN_RESIZE_RANGE = 60;

/**
 * The widest board the window could hold in the current arrangement: the viewport minus the shell's padding and,
 * while the side panel sits beside the board, that panel and its gap. It does not depend on the current board
 * size, so the layout can grow to this width when a player asks for a larger board.
 */
function measureRoom(shell: HTMLElement, layout: HTMLElement): number {
  const shellStyle = getComputedStyle(shell);
  const padding = parseFloat(shellStyle.paddingLeft) + parseFloat(shellStyle.paddingRight);
  // The used track sizes ("858px 310px" beside the side panel, "1192px" when stacked); the first is the board column.
  const column = parseFloat(getComputedStyle(layout).gridTemplateColumns);
  const room = document.documentElement.clientWidth - padding - (Number.isFinite(column) ? layout.clientWidth - column : 0);
  return Number.isFinite(room) ? Math.max(0, Math.floor(room)) : 0;
}

/**
 * Remembered custom board size for the local game screen. Until a size is chosen the stylesheet fits the board to
 * the window. Attach the three refs to the game shell, its layout grid and the board's play area.
 */
export function useBoardSize(zen: boolean) {
  const [preferred, setPreferred] = useState<number | null>(() => readBoardSize());
  const [room, setRoom] = useState(0);
  const [rendered, setRendered] = useState(0);
  const shellRef = useRef<HTMLElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const boardAreaRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const shell = shellRef.current, layout = layoutRef.current, boardArea = boardAreaRef.current;
    if (!shell || !layout || !boardArea) return;
    const measure = () => {
      setRoom(measureRoom(shell, layout));
      setRendered(Math.round(boardArea.getBoundingClientRect().width));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(layout); observer.observe(boardArea);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [zen]);

  const max = Math.floor(room / BOARD_SIZE_STEP) * BOARD_SIZE_STEP;
  const min = Math.min(MIN_BOARD_SIZE, max);
  const setSize = (size: number) => {
    const next = snapBoardSize(size, min, max);
    setPreferred(next); writeBoardSize(next);
  };
  const reset = () => { setPreferred(null); writeBoardSize(null); };

  return {
    shellRef, layoutRef, boardAreaRef,
    /** Carries the chosen size into the stylesheet; absent while the window decides, and always in zen mode. */
    style: !zen && preferred !== null ? { "--board-size": `${preferred}px` } as CSSProperties : undefined,
    custom: preferred !== null,
    canResize: !zen && max - min >= MIN_RESIZE_RANGE,
    min, max,
    /** What the slider shows: the chosen size, or the fitted width until one is chosen, within what the window holds. */
    value: snapBoardSize(preferred ?? rendered, min, max),
    setSize, reset,
    /** The board's current on-screen width, for drags that start from whatever size is showing. */
    currentWidth: () => boardAreaRef.current?.getBoundingClientRect().width ?? rendered,
  };
}
