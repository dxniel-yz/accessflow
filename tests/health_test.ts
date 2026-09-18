import { handleRequest } from "../src/app.ts";

Deno.test("GET /health returns healthy JSON", async () => {
  const request = new Request("http://localhost:8000/health");
  const response = handleRequest(request);

  if (response.status !== 200) {
    throw new Error(`Expected status 200, received ${response.status}`);
  }

  const contentType = response.headers.get("content-type");
  if (!contentType?.startsWith("application/json")) {
    throw new Error(`Expected JSON content type, received ${contentType}`);
  }

  const body = await response.json();
  if (body.status !== "healthy") {
    throw new Error(
      `Expected healthy status, received ${JSON.stringify(body)}`,
    );
  }
});
