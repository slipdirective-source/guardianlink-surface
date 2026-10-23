// Zero-dependency static server for the cognitive-surface front end.
// Serves ui/ (index.html + dist/bundle.js + dist/bundle.css).
// Usage: node ui/serve.js [port]   (default 4173)
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.argv[2] || process.env.PORT || 4173);
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

http
  .createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath === "/") urlPath = "/index.html";
    const file = path.join(root, urlPath);
    if (!file.startsWith(root)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { "content-type": "text/plain" }).end("not found");
        return;
      }
      res
        .writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" })
        .end(data);
    });
  })
  .listen(port, () => {
    console.log(`cognitive surface: http://localhost:${port}/`);
  });
