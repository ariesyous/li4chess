import build from "../.generated/build.json";

interface Env { ASSETS: Fetcher; APP_ENV: "local" | "staging" | "production" }

function json(request: Request, body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(request.method === "HEAD" ? null : JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff", ...extra },
  });
}

/** Stateless application host. No game authority, credentials, or spike hooks. */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.headers.has("Upgrade")) return json(request, { error: "upgrade_not_supported" }, 400);
    let path: string;
    try { path = decodeURIComponent(new URL(request.url).pathname); }
    catch { return json(request, { error: "invalid_path" }, 400); }
    // Reject ambiguous/internal path forms rather than passing them to SPA fallback.
    if (path.includes("\\") || path.includes("%") || /[\u0000-\u001f\u007f]/.test(path) ||
        path.split("/").some(part => part.startsWith("."))) {
      return json(request, { error: "not_found" }, 404);
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json(request, { error: "method_not_allowed" }, 405, { Allow: "GET, HEAD" });
    }
    if (path === "/api/health") return json(request, { ok: true, service: "li4chess", environment: env.APP_ENV });
    if (path === "/api/build") return json(request, { service: "li4chess", environment: env.APP_ENV,
      target: build.target, basePath: build.basePath, sourceRevision: build.producer.sourceRevision,
      buildFingerprint: build.producer.buildFingerprint, workingTree: build.producer.workingTree.status });
    if (path === "/api" || path.startsWith("/api/")) return json(request, { error: "not_found" }, 404);
    if (/^\/(?:src|node_modules|@vite|@fs|@id|\.generated)(?:\/|$)/.test(path)) {
      return json(request, { error: "not_found" }, 404);
    }
    try {
      const asset = await env.ASSETS.fetch(request);
      if (asset.status !== 404) return asset;
      // No implicit fallback for files or the reserved asset namespace, even
      // with Sec-Fetch-Mode: navigate. Extensionless paths are local-app aliases.
      if (path === "/assets" || path.startsWith("/assets/") || path.includes(".")) {
        return json(request, { error: "not_found" }, 404);
      }
      const shell = new URL(request.url); shell.pathname = "/index.html"; shell.search = "";
      return await env.ASSETS.fetch(new Request(shell, { method: request.method }));
    } catch {
      return json(request, { error: "assets_unavailable" }, 503);
    }
  },
} satisfies ExportedHandler<Env>;
