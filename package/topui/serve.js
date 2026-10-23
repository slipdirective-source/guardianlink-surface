// Zero-dependency static server + sidecar proxy for the top-end console.
//
//   node topui/serve.js            # http://127.0.0.1:4317
//   PORT=8081 node topui/serve.js
//
// /v1/* is proxied to the engine sidecar (GUARDIANLINK_SIDECAR,
// default http://127.0.0.1:8080 — the sidecar's own default port), so
// the page talks to the real API same-origin. A dead sidecar yields a
// 502 JSON error; the console renders that as "unreachable" and invents
// nothing.
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT || 4317);
const sidecar = new URL(process.env.GUARDIANLINK_SIDECAR || "http://127.0.0.1:8080");

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function proxy(req, res) {
  const lib = sidecar.protocol === "https:" ? https : http;
  const upstream = lib.request(
    {
      hostname: sidecar.hostname,
      port: sidecar.port || (sidecar.protocol === "https:" ? 443 : 80),
      path: req.url,
      method: req.method,
      headers: { "content-type": req.headers["content-type"] || "application/json" },
    },
    (up) => {
      res.writeHead(up.statusCode || 502, {
        "content-type": up.headers["content-type"] || "application/json",
      });
      up.pipe(res);
    }
  );
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "sidecar unreachable" }));
  });
  req.pipe(upstream);
}

http
  .createServer((req, res) => {
    if (req.url.startsWith("/v1/")) return proxy(req, res);
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
    const file = path.join(root, rel);
    if (!file.startsWith(root)) {
      res.writeHead(403);
      return res.end("forbidden");
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end("not found");
      }
      res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
      res.end(data);
    });
  })
  .listen(port, () => {
    console.log(`top-ui on http://127.0.0.1:${port}  (sidecar proxy -> ${sidecar.origin})`);
  });
