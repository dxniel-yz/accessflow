import { createApiHandler } from "./api/router.ts";

if (import.meta.main) {
  Deno.serve({ hostname: "127.0.0.1", port: 8000 }, createApiHandler());
}
