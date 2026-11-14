// server.js — Passenger entry point for cPanel "Setup Node.js App" deployments.
// Not used by `npm run dev` / `npm start`; only run directly (node server.js)
// or as the Application startup file in cPanel.
// See CPANEL-SETUP.md for the full deployment walkthrough.
process.env.NODE_ENV = "production";

const { createServer } = require("http");
const next = require("next");

const port = Number(process.env.PORT) || 3000; // Passenger injects PORT
const app = next({ dev: false });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => handle(req, res)).listen(port, () => {
    console.log("Noor system ready on port " + port);
  });
});
