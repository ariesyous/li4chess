import {
  ALL_COLORS,
  GameState,
  Piece,
  PieceType,
  PlayerColor,
  createInitialState,
  fileOf,
  rankOf,
  squareOf,
} from "@li4chess/engine";

const NO_CASTLING = { kingside: false, queenside: false } as const;

export interface Placement {
  readonly type: PieceType;
  readonly owner: PlayerColor;
  readonly at: readonly [file: number, rank: number];
}

export function place(type: PieceType, owner: PlayerColor, file: number, rank: number): Placement {
  return { type, owner, at: [file, rank] };
}

/**
 * A hand-built position: only the listed pieces on the board, only the listed
 * players still in the game, and no castling rights anywhere (every piece is
 * marked as already moved). Kept in the test folder rather than the engine
 * because it deliberately skips the setup invariants a real game maintains.
 */
export function position(
  pieces: readonly Placement[],
  turn: PlayerColor,
  activeColors: readonly PlayerColor[] = ALL_COLORS
): GameState {
  const base = createInitialState();
  const board: (Piece | null)[] = base.board.map(() => null);
  for (const { type, owner, at } of pieces) {
    board[squareOf(at[0], at[1])] = { type, owner, hasMoved: true };
  }

  const players = { ...base.players };
  for (const color of ALL_COLORS) {
    if (activeColors.includes(color)) continue;
    players[color] = { ...players[color], status: "checkmated", eliminatedOnTurn: 1 };
  }

  return {
    ...base,
    board,
    players,
    turn,
    positionCounts: {},
    castlingRights: {
      [PlayerColor.Red]: NO_CASTLING,
      [PlayerColor.Blue]: NO_CASTLING,
      [PlayerColor.Yellow]: NO_CASTLING,
      [PlayerColor.Green]: NO_CASTLING,
    },
  };
}

export function describeSquare(square: number): string {
  return `(${fileOf(square)},${rankOf(square)})`;
}

/** Small deterministic PRNG, so difficulty levels that sample randomly stay reproducible in tests. */
export function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
