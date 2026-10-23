// GuardianLink surface package server — zero-dependency Node.
//
//   node server.js                 # http://127.0.0.1:4317
//   PORT=8081 node server.js
//
// Routes:
//   /            the cognitive surface (ui/) — a PWA; installable
//   /topui/      the observer console (topui/)
//   /v1/*        proxied to the GuardianLink engine sidecar
//                (GUARDIANLINK_SIDECAR, default http://127.0.0.1:8080).
//                A dead sidecar yields a 502 JSON error — the console
//                renders that as "unreachable" and invents nothing.
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const uiRoot = path.join(root, "ui");
const topuiRoot = path.join(root, "topui");
const port = Number(process.env.PORT || 4317);
const sidecar = new URL(
  process.env.GUARDIANLINK_SIDECAR || "http://127.0.0.1:8080"
);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function proxy(req, res) {
  const lib = sidecar.protocol === "https:" ? https : http;
  const upstream = lib.request(
    {
      hostname: sidecar.hostname,
      port: sidecar.port || (sidecar.protocol === "https:" ? 443 : 80),
      path: req.url,
      method: req.method,
      headers: {
        "content-type": req.headers["content-type"] || "application/json",
      },
    },
    (up) => {
      res.writeHead(up.statusCode || 502, {
        "content-type": up.headers["content-type"] || "application/json",
      });
      up.pipe(res);
    }
  );
  upstream.on("error", () => {
    if (!res.headersSent)
      res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "sidecar unreachable" }));
  });
  req.pipe(upstream);
}

function serveFile(base, rel, res) {
  const file = path.join(base, rel);
  if (!file.startsWith(base)) {
    res.writeHead(403);
    return res.end("forbidden");
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end("not found");
    }
    res.writeHead(200, {
      "content-type": types[path.extname(file)] || "application/octet-stream",
    });
    res.end(data);
  });
}

http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath.startsWith("/v1/")) return proxy(req, res);
    if (urlPath === "/topui" || urlPath.startsWith("/topui/")) {
      const rel = urlPath.replace(/^\/topui\/?/, "") || "index.html";
      return serveFile(topuiRoot, rel, res);
    }
    const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
    return serveFile(uiRoot, rel, res);
  })
  .listen(port, () => {
    console.log(`GuardianLink Surface:  http://127.0.0.1:${port}/`);
    console.log(`Observer console:      http://127.0.0.1:${port}/topui/`);
    console.log(`sidecar proxy /v1/* -> ${sidecar.origin}`);
  });
