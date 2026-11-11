import { useId, useRef } from "react";
import { createPortal } from "react-dom";
import { PieceType } from "@li4chess/engine";
import type { PlayerColor } from "@li4chess/engine";
import { Piece, PLAYER_COLOR_HEX, PLAYER_COLOR_NAME } from "@li4chess/ui-kit";
import type { CaptureGroup } from "../game/capturedPieces.js";

const names: Record<PieceType, string> = { P: "Pawn", N: "Knight", B: "Bishop", R: "Rook", Q: "Queen", K: "King" };
const description = ({ piece, count }: CaptureGroup) => `${count} ${PLAYER_COLOR_NAME[piece.owner]} ${names[piece.type]}${count === 1 ? "" : "s"}${piece.promotedFrom ? " (promoted pawn)" : ""}`;

export function CapturedPieces({ player, groups }: { player: PlayerColor; groups: readonly CaptureGroup[] }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const total = groups.reduce((sum, group) => sum + group.count, 0);
  const preview = groups.slice(0, 4);
  const remaining = total - preview.reduce((sum, group) => sum + group.count, 0);
  const label = `Pieces captured by ${PLAYER_COLOR_NAME[player]}`;
  const summary = groups.length ? groups.map(description).join(", ") : "No pieces captured yet";
  const close = () => {
    dialog.current?.close();
    // Restore focus in the closing interaction, before another Tab can advance it.
    trigger.current?.focus({ preventScroll: true });
  };

  return <>
    <span className="captures-compact" aria-hidden="true"><Piece type={PieceType.Pawn} color="#817b70" /><span>{total}</span></span>
    <button ref={trigger} type="button" className="player-captures" data-testid={`captures-${player}`}
      aria-label={`${label}: ${total}`} aria-haspopup="dialog" title={`${label}: ${summary}. Open the full list.`}
      onClick={() => dialog.current?.showModal()}>
      <span className="captures-preview" aria-hidden="true">
        <span className="captures-caption">Captured</span>
        <span className="captures-icons">{preview.map(group => <span key={group.key} className="capture-piece" title={description(group)}>
          <Piece type={group.piece.type} color={PLAYER_COLOR_HEX[group.piece.owner]} />
          {group.count > 1 && <span className="capture-count">{group.count}</span>}
        </span>)}</span>
        {!total && <span className="captures-empty">—</span>}
        {remaining > 0 && <span className="captures-more">+{remaining} more</span>}
      </span>
    </button>
    {createPortal(<dialog ref={dialog} className="captures-dialog" aria-labelledby={heading}
      onCancel={event => { event.preventDefault(); close(); }}>
      <header><h2 id={heading}>{label}</h2><button type="button" onClick={close}>Close</button></header>
      {groups.length ? <ul>{groups.map(group => <li key={group.key}>
        <Piece type={group.piece.type} color={PLAYER_COLOR_HEX[group.piece.owner]} /><span>{description(group)}</span>
      </li>)}</ul> : <p>No pieces captured yet.</p>}
    </dialog>, document.body)}
  </>;
}
