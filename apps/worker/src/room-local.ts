import { GameRoom as MaintainedGameRoom } from "@li4chess/game-room";
import type { GameRoomEnvironment } from "@li4chess/game-room";
import type { EngineBuildIdentityV1 } from "@li4chess/protocol";
import build from "../.generated/build.json";

// Explicit local-only configuration exports the maintained class. The default
// staging/production entry and all existing fetch behavior remain unchanged.
export { default } from "./index.js";
export class GameRoom extends MaintainedGameRoom {
  constructor(ctx: DurableObjectState, env: Omit<GameRoomEnvironment, "ROOM_PRODUCER">) {
    // Generated JSON widens literal fields when it exists on disk. The build
    // generator supplies this identity; room replay validation checks its schema.
    super(ctx, { ...env, ROOM_PRODUCER: build.producer as EngineBuildIdentityV1 });
  }
}
