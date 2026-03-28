import { config } from "./config.js";
import { createServerManager } from "./server-manager.js";

const manager = createServerManager({
  dataDir: config.dataDir
});

await manager.start();

process.on("SIGINT", async () => {
  await manager.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await manager.stop();
  process.exit(0);
});
