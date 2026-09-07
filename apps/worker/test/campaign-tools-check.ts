import assert from "node:assert/strict";
import { createServer } from "node:http";
import { request } from "@playwright/test";
import { campaignHttp, sanitizeCampaign, campaignJson } from "./campaign-http.js";

let calls = 0;
const sockets = new Set<unknown>();
const server = createServer((req, res) => {
  calls++; sockets.add(req.socket); assert.equal(req.headers.connection, "close");
  if (req.url === "/reset") { req.socket.destroy(); return; }
  res.end("ok");
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const address = server.address(); assert(address && typeof address === "object");
const origin = `http://127.0.0.1:${address.port}`, client = await request.newContext();
try {
  for (let i = 0; i < 2; i++) assert.equal(await (await client.post(origin, campaignHttp)).text(), "ok");
  assert.equal(sockets.size, 2, "driver requests use distinct sockets");
  await assert.rejects(client.post(`${origin}/reset`, campaignHttp));
  assert.equal(calls, 3, "an interrupted request is not retried");
} finally { await client.dispose(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
const known = "known-fixture-value".repeat(4), unknown = "unknown-fixture-value";
const input = `socket hang up\nCookie: guest=${unknown}\nX-Li4chess-Connection: ${unknown}\nX-M3-06-Key: ${unknown}\nAuthorization: Bearer ${unknown}\nSet-Cookie: guest=${unknown}\nknown ${known}\nprefix ${known.slice(0,32)}\nenv.M3_06_KEY ${unknown}`;
const sanitized = sanitizeCampaign(input, [known]);
assert(!sanitized.includes(known) && !sanitized.includes(unknown));
const retained = JSON.parse(campaignJson({ failure: input, passed: false }, [known]));
assert.equal(retained.passed, false); assert(!retained.failure.includes(unknown));
const thrown = new Error(sanitized); assert(!thrown.stack!.includes(unknown)); assert.equal(thrown.cause, undefined);
console.log("Campaign driver: distinct sockets, zero retries and sanitized error/header output verified");
