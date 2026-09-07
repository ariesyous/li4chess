import { GameRoom as MaintainedGameRoom } from "@li4chess/game-room";
import type { GameRoomEnvironment } from "@li4chess/game-room";
import build from "../.generated/build.json";

// Explicit local-only configuration exports the maintained class. The default
// staging/production entry and all existing fetch behavior remain unchanged.
export { default } from "./index.js";
export class GameRoom extends MaintainedGameRoom {
  constructor(ctx: DurableObjectState, env: Omit<GameRoomEnvironment, "ROOM_PRODUCER">) {
    super(ctx, { ...env, ROOM_PRODUCER: build.producer });
  }
}
