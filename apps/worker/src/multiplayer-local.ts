import { GuestService as MaintainedGuestService, checkOnlineOrigin } from "@li4chess/game-room/guest-service";
import type { GuestEnvironment } from "@li4chess/game-room/guest-service";
import type { EngineBuildIdentityV1 } from "@li4chess/protocol";
import application from "./index.js";
import build from "../.generated/build.json";
export { GameRoom } from "./room-local.js";
export class GuestService extends MaintainedGuestService {
  constructor(ctx:DurableObjectState,env:GuestEnvironment){super(ctx,{...env,ROOM_PRODUCER:build.producer as EngineBuildIdentityV1});}
}
interface Environment extends GuestEnvironment { GUESTS:DurableObjectNamespace<GuestService>;ASSETS:Fetcher;APP_ENV:"local" }
export default {async fetch(request:Request,env:Environment):Promise<Response>{
  if(new URL(request.url).pathname!=="/api/online")return application.fetch(request,env);
  try{checkOnlineOrigin(request,env.ONLINE_ORIGIN);}catch{return Response.json({version:"li4chess-online-v1",type:"error",code:"origin",ambiguous:false},{status:403,headers:{"Cache-Control":"no-store"}});}
  return env.GUESTS.get(env.GUESTS.idFromName("private-service-v1")).fetch(request);
}} satisfies ExportedHandler<Environment>;
