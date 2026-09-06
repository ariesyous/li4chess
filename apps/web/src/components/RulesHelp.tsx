export function RulesHelp({ open = false }: { open?: boolean }) {
  return <details className="rules-help" open={open || undefined}>
    <summary>How free-for-all works</summary>
    <p>Red → Blue → Yellow → Green. Protect your own King. The highest final points win, including points earned by eliminated players; equal scores share a place.</p>
    <p>Captures: Pawn 1 · Knight 3 · Bishop 5 · Rook 5 · Queen 9. Pawns automatically become Queens on their eighth rank, worth only 1 point when captured.</p>
    <p>Checkmate awards 20 points, split between active checking players. Newly checking several Kings also earns points. The points history explains each award.</p>
    <p>Mate and stalemate resolve when that player's turn arrives. Dead pieces stay as blockers, cannot attack, and are captured for zero points. After resignation or timeout, a live King walks automatically on its regular turns.</p>
    <p>A forfeit before everyone has made three moves aborts without placements. Later, a third elimination ends play. With two active players, a 21-point leader may Claim Win; the other player receives 20 points and final scores decide the result.</p>
    <p>Repetition, insufficient material and 200 reversible turns end play automatically. Active players get 10 points each. This local game has no running clocks.</p>
  </details>;
}
