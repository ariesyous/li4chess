import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { BOARD_SIZE_STEP, MAX_BOARD_SIZE, MIN_BOARD_SIZE, readBoardSize, snapBoardSize, writeBoardSize } from "./displayPrefs.js";

/** Below this, fixed controls need scrolling; keep the chessboard usable instead of collapsing it. */
const MIN_FITTED_BOARD_SIZE = 200;

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
  // clientWidth includes an empty reserved scrollbar gutter in Chromium.
  // The root's rendered width stays constant when that scrollbar appears.
  const room = document.documentElement.getBoundingClientRect().width - padding - (Number.isFinite(column) ? layout.clientWidth - column : 0);
  return Number.isFinite(room) ? Math.max(0, Math.floor(room)) : 0;
}

/**
 * Remembered custom board size for the local game screen. Until a size is chosen the stylesheet fits the board to
 * the window. Refs measure the shell, layout, play area, board frame and square board.
 */
export function useBoardSize(zen: boolean) {
  const [preferred, setPreferred] = useState<number | null>(() => readBoardSize());
  const [room, setRoom] = useState<number | null>(null);
  const [rendered, setRendered] = useState(0);
  const [fitHeight, setFitHeight] = useState(MAX_BOARD_SIZE);
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const boardAreaRef = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const shell = shellRef.current, layout = layoutRef.current, boardArea = boardAreaRef.current;
    const viewportElement = viewportRef.current;
    if (!shell || !layout || !boardArea || !viewportElement) return;
    let lastWidth = 0, lastHeight = 0;
    const measure = () => {
      setRoom(measureRoom(shell, layout));
      setRendered(Math.round(boardArea.getBoundingClientRect().width));
      // Small viewport units exclude retractable browser bars and pinch zoom.
      // Only a changed window (or explicit Zen toggle) starts a fresh height fit.
      const width = window.innerWidth, height = Math.round(viewportElement.getBoundingClientRect().height);
      if (width !== lastWidth || height !== lastHeight) {
        lastWidth = width; lastHeight = height;
        setViewport({ width, height });
        setFitHeight(MAX_BOARD_SIZE);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(layout); observer.observe(boardArea); observer.observe(viewportElement);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect(); window.removeEventListener("resize", measure);
    };
  }, [zen]);

  useLayoutEffect(() => {
    const frame = frameRef.current, board = boardRef.current;
    if (!viewport || !frame || !board) return;
    const frameBox = frame.getBoundingClientRect();
    const chrome = frameBox.height - board.getBoundingClientRect().height;
    const available = Math.floor(viewport.height - (frameBox.top + window.scrollY) - chrome - 16);
    // A fit only shrinks until settled. Compact card breakpoints must not
    // alternate between two sizes; window/Zen changes start again from MAX.
    setFitHeight(Math.min(fitHeight, Math.max(MIN_FITTED_BOARD_SIZE, available)));
    // Fit iterations account for wrapping caused by our own size change. Game
    // notices, selection text and player states must never start another fit.
  }, [viewport, fitHeight]);

  // A remembered preference is a target; both current window dimensions bound its display.
  // Leave the first layout unconstrained until it can be measured, rather than measuring a zero-width board.
  const max = Math.max(BOARD_SIZE_STEP,
    Math.floor(Math.min(room ?? MAX_BOARD_SIZE, fitHeight) / BOARD_SIZE_STEP) * BOARD_SIZE_STEP);
  const min = Math.min(MIN_BOARD_SIZE, max);
  const value = snapBoardSize(preferred ?? rendered, min, max);
  const setSize = (size: number) => {
    const next = snapBoardSize(size, min, max);
    setPreferred(next); writeBoardSize(next);
  };
  const reset = () => { setPreferred(null); writeBoardSize(null); setFitHeight(MAX_BOARD_SIZE); };

  return {
    shellRef, layoutRef, boardAreaRef, frameRef, boardRef, viewportRef,
    /** Height bounds every board; the capped custom width applies outside zen mode. */
    style: { "--board-fit-height": `${fitHeight}px`,
      ...(!zen && preferred !== null ? { "--board-size": `${value}px` } : {}),
    } as CSSProperties,
    custom: preferred !== null,
    canResize: !zen && room !== null && max > min,
    min, max,
    /** What the slider shows: the chosen size, or the fitted width until one is chosen, within what the window holds. */
    value,
    setSize, reset,
    /** The board's current on-screen width, for drags that start from whatever size is showing. */
    currentWidth: () => boardAreaRef.current?.getBoundingClientRect().width ?? rendered,
  };
}
