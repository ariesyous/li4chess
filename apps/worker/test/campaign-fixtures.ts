// Synthetic checkpoints, never evidence of play from the ordinary opening.
import { ALL_COLORS, createInitialState, localSquare, PieceType, resignPlayer, positionKey,
  type GameState, type Piece, type PlayerColor } from "@li4chess/engine";
import { createReplay, readReplay, type EngineBuildIdentityV1 } from "@li4chess/protocol";
export type Scenario = "ordinary" | "claim" | "mate" | "stalemate" | "insufficient" | "fifty-move" | "repetition";
type Placement = readonly [number, number, PieceType, PlayerColor];
const { King: K, Knight: N, Rook: R, Pawn: P, Queen: Q, Bishop: B } = PieceType;
const kings: Placement[] = [[7,0,K,0],[0,6,K,1],[6,13,K,2],[13,7,K,3]];
export const square = (file:number,rank:number) => localSquare(0,file-3,rank);
export async function fixtureReplay(scenario:Scenario, producer:EngineBuildIdentityV1) {
  if(scenario === "ordinary") return createReplay(createInitialState(),producer);
  let pieces:Placement[] = kings;
  if(["fifty-move","claim"].includes(scenario)) pieces=[...kings,[5,5,R,0]];
  if(scenario === "repetition") pieces=[...kings,[3,3,N,0]];
  if(scenario === "mate" || scenario === "stalemate") pieces=[
    [3,0,K,0],[0,6,K,1],[8,10,K,2],[13,7,K,3],[5,0,N,1],[6,1,N,1],[6,2,N,1],
    [3,11,P,0],[4,11,P,0],[5,11,P,0],[3,12,Q,0],[4,12,B,0],[5,12,P,0],[3,13,N,0],[4,13,R,0],[5,13,P,0],
    ...(scenario === "mate" ? [[3,3,R,1] as Placement] : [])];
  const board:(Piece|null)[]=Array(196).fill(null);
  for(const [file,rank,type,owner] of pieces) {
    const at=square(file,rank); if(board[at]) throw new Error("duplicate fixture square");
    board[at]={type,owner,hasMoved:true};
  }
  let state:GameState={...createInitialState(),board,positionCounts:{},completedMoves:{0:3,1:3,2:3,3:3},
    castlingRights:Object.fromEntries(ALL_COLORS.map(c=>[c,{kingside:false,queenside:false}])) as GameState["castlingRights"]};
  if(scenario === "mate" || scenario === "stalemate") state={...state,turn:1};
  if(scenario === "fifty-move") state={...state,reversibleMoves:198};
  if(scenario === "repetition") state={...state,positionCounts:{[positionKey(state)]:1}};
  if(scenario === "claim") {
    state=resignPlayer(resignPlayer(state,2),3);
    state={...state,turn:1,players:{...state.players,0:{...state.players[0],score:21},2:{...state.players[2],score:100}}};
  }
  const replay=await createReplay(state,producer); await readReplay(replay); return replay;
}
