import { useRef } from "react";
import { boardSizeFromDrag } from "../game/displayPrefs.js";
import { Icon } from "./Icon.js";

/**
 * Pointer-only grip for the empty top-right corner of the board. Keyboard and assistive-technology users resize
 * with the Board size slider in Board display, so the grip is hidden from the accessibility tree and not focusable.
 */
export function BoardResizer({ getWidth, onResize, onReset }: {
  getWidth: () => number; onResize: (width: number) => void; onReset: () => void;
}) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  return <div className="board-resizer" data-testid="board-resizer" aria-hidden="true"
    title="Drag sideways to resize the board. Double-click to fit it to the window."
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { x: event.clientX, width: getWidth() };
      event.preventDefault();
    }}
    onPointerMove={event => {
      const start = drag.current;
      if (start) onResize(boardSizeFromDrag(start.width, event.clientX - start.x));
    }}
    onPointerUp={() => { drag.current = null; }}
    onPointerCancel={() => { drag.current = null; }}
    onDoubleClick={onReset}><Icon name="resize" /></div>;
}
