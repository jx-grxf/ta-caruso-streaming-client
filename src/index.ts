import { config } from "./config.js";
import { createServerManager } from "./server-manager.js";
import { runTerminalUi } from "./tui.js";

const manager = createServerManager({
  dataDir: config.dataDir,
  loggerEnabled: false
});

const isDevMode = process.env.DEV_MODE === "1";
const appLabel = isDevMode ? "Caruso Reborn Dev" : "Caruso Reborn";

function printStartupError(error: unknown) {
  const nodeError = error as NodeJS.ErrnoException;

  if (nodeError?.code === "EADDRINUSE") {
    console.log("");
    console.log(`${appLabel} startup failed`);
    console.log(`Port ${config.port} is already in use on ${config.host}`);
    console.log("Likely another local instance is still running.");
    console.log("To find what's using the port:");
    console.log(`  Unix/macOS:           lsof -iTCP:${config.port} -sTCP:LISTEN`);
    console.log(`  Windows (cmd):        netstat -ano | findstr :${config.port}`);
    console.log(`  Windows (PowerShell): Get-NetTCPConnection -LocalPort ${config.port}`);
    console.log("To try a different port and restart:");
    console.log(`  Unix/macOS:           PORT=${config.port + 1} npm run dev`);
    console.log(`  Windows (cmd):        set PORT=${config.port + 1} && npm run dev`);
    console.log(`  Windows (PowerShell): $env:PORT=${config.port + 1}; npm run dev`);
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
