import { config } from "./config.js";
import { createServerManager } from "./server-manager.js";
import { runTerminalUi } from "./tui.js";

const manager = createServerManager({
  dataDir: config.dataDir,
  loggerEnabled: false
});

const isDevMode = process.env.DEV_MODE === "1";
const appLabel = isDevMode ? "Caruso Bridge Dev" : "Caruso Bridge";

function printStartupError(error: unknown) {
  const nodeError = error as NodeJS.ErrnoException;

  if (nodeError?.code === "EADDRINUSE") {
    console.log("");
    console.log(`${appLabel} startup failed`);
    console.log(`Port ${config.port} is already in use on ${config.host}`);
    console.log("Likely another local instance is still running.");
    console.log(`Try: lsof -iTCP:${config.port} -sTCP:LISTEN`);
    console.log(`Or:  PORT=${config.port + 1} npm run dev`);
    return;
  }

  console.log("");
  console.log(`${appLabel} startup failed`);
  console.log(error instanceof Error ? error.message : "Unknown error");
  console.error(error);
}

try {
  await runTerminalUi(manager, {
    dataDir: config.dataDir,
    appLabel,
    isDevMode
  });
} catch (error) {
  printStartupError(error);
  process.exit(1);
}
