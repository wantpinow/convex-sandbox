import { createServer } from "http";
import { route } from "./router.js";

const PORT = parseInt(process.env.WEBDAV_PORT ?? "1900", 10);

const server = createServer((req, res) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(`${req.method} ${req.url} → ${res.statusCode} (${ms}ms)`);
  });
  route(req, res);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`WebDAV server listening on http://0.0.0.0:${PORT}`);
});
