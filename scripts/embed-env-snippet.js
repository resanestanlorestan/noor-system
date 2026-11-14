// embedded env loader (cPanel slim deploy) — must stay first in standalone/server.js
(function () {
  try {
    const fs = require("fs");
    const path = require("path");
    const envPath = path.join(__dirname, "..", "..", ".env"); // app root .env
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && !line.trim().startsWith("#") && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch (e) { /* .env missing — rely on Passenger env vars */ }
})();
