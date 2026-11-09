import { useId, useRef } from "react";
import type { PointerEvent } from "react";
import { BOARD_SIZE_STEP, boardSizeFromDrag } from "../game/displayPrefs.js";
import { Icon } from "./Icon.js";

/** Mouse and keyboard grip; touch users have an explicit slider in Board display. */
export function BoardResizer({ getWidth, onResize, onReset, min, max, value }: {
  getWidth: () => number; onResize: (width: number) => void; onReset: () => void;
  min: number; max: number; value: number;
}) {
  const drag = useRef<{ id: number; x: number; y: number; width: number } | null>(null);
  const pointerType = useRef("");
  const helpId = useId();
  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <><div className="board-resizer" data-testid="board-resizer" role="slider" tabIndex={0}
    aria-label="Resize board" aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.max(min, Math.min(max, value))}
    aria-valuetext={`${value} pixels`} aria-describedby={helpId}
    title="Resize board: drag or use arrow keys. Double-click to fit the window."
    onKeyDown={event => {
      const sizes: Record<string, number> = {
        ArrowLeft: value - BOARD_SIZE_STEP, ArrowDown: value - BOARD_SIZE_STEP,
        ArrowRight: value + BOARD_SIZE_STEP, ArrowUp: value + BOARD_SIZE_STEP,
        PageDown: value - 70, PageUp: value + 70, Home: min, End: max,
      };
      if (sizes[event.key] === undefined) return;
      event.preventDefault(); onResize(sizes[event.key]);
    }}
    onPointerDown={event => {
      pointerType.current = event.pointerType;
      if (event.pointerType !== "mouse" || !event.isPrimary || event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.focus({ preventScroll: true });
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, width: getWidth() };
    }}
    onPointerMove={event => {
      const start = drag.current;
      if (start?.id === event.pointerId) onResize(boardSizeFromDrag(start.width, event.clientX - start.x, event.clientY - start.y));
    }}
    onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}
    onDoubleClick={() => { if (pointerType.current === "mouse") onReset(); }}><Icon name="resize" /></div>
    <span id={helpId} className="sr-only">Drag with a mouse to resize the board. Arrow keys adjust the size; Home makes it smallest and End makes it largest. Double-click to fit the window.</span></>;
}
