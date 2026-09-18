/** Handle HTTP requests independently of the server for straightforward testing. */
export function handleRequest(request: Request): Response {
  const { pathname } = new URL(request.url);

  if (request.method === "GET" && pathname === "/health") {
    return Response.json({ status: "healthy" });
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}
