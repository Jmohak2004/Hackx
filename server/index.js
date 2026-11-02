const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const { createApp } = require("./app");

function start() {
  const port = Number(process.env.PORT || 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a valid TCP port");
  const services = createApp();
  services.evaluations.resume();
  const server = services.app.listen(port, process.env.HOST || "127.0.0.1", () => {
    console.log("HackX API listening on port " + port);
  });
  function shutdown() {
    services.evaluations.stop();
    server.close(() => services.blockchain.close());
    const timer = setTimeout(() => process.exit(0), 10_000);
    timer.unref();
  }
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  return { server, ...services };
}

if (require.main === module) start();
module.exports = { start };
