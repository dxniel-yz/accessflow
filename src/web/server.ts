import { createApiHandler } from "../api/router.ts";
import { demoConfiguration } from "../demo/configuration.ts";

const assets: Record<string, [string, string]> = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/web/styles.css": ["styles.css", "text/css; charset=utf-8"],
  "/web/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/web/api-client.js": ["api-client.js", "text/javascript; charset=utf-8"],
  "/web/state.js": ["state.js", "text/javascript; charset=utf-8"],
};

/** Exact asset allowlist: URL paths are never used as filesystem paths. */
export function createWebHandler(
  api = createApiHandler(),
  readAsset: (url: URL) => Promise<string> = (url) => Deno.readTextFile(url),
): (request: Request) => Promise<Response> {
  return async (request) => {
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && path === "/web/config.json") {
      return Response.json({
        ...demoConfiguration,
        workspaceIds: ["demo-workspace", "demo-workspace-b"],
      });
    }
    const asset = Object.hasOwn(assets, path) ? assets[path] : undefined;
    if ((request.method === "GET" || request.method === "HEAD") && asset) {
      try {
        const body = await readAsset(new URL(asset[0], import.meta.url));
        return new Response(request.method === "HEAD" ? null : body, {
          headers: {
            "content-type": asset[1],
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
            "content-security-policy":
              "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
          },
        });
      } catch {
        return Response.json({
          error: { code: "ASSET_ERROR", message: "Frontend asset unavailable" },
        }, { status: 500 });
      }
    }
    return api(request);
  };
}
