// Vite-only test page. No application/deployable entry imports this harness.
import { StrictMode,useState } from "react";
import { createRoot } from "react-dom/client";
import { ReplayDownload } from "../src/online/ReplayDownload.js";
import type { OnlineSnapshot } from "@li4chess/protocol";
import type { Session } from "../src/online/connection.js";
const fixture=(window as unknown as {replayFixture:{snapshot:OnlineSnapshot;session:Session}}).replayFixture;
function Harness(){
  const [identity,setIdentity]=useState(1),[mounted,setMounted]=useState(true);
  const [controller]=useState(()=>new AbortController());
  return <><button onClick={()=>setIdentity(n=>n+1)}>Change identity</button><button onClick={()=>setMounted(false)}>Unmount</button>
    {mounted&&<ReplayDownload room={`room-${identity}`} session={{...fixture.session,principal:`p${identity}`,generation:identity}}
      snapshot={{...fixture.snapshot,gameId:`room-${identity}`}} signal={controller.signal} allowed={true}/>}</>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><Harness/></StrictMode>);
