import { config } from "./config.js";
import { createServerManager } from "./server-manager.js";

const manager = createServerManager({
  dataDir: config.dataDir
});

const supportsColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const isDevMode = process.env.DEV_MODE === "1";
const appLabel = isDevMode ? "Caruso Bridge Dev" : "Caruso Bridge";

function color(code: number, value: string): string {
  if (!supportsColor) {
    return value;
  }

  return `\u001b[${code}m${value}\u001b[0m`;
}

function padLabel(label: string): string {
  return `${label}:`.padEnd(13, " ");
}

function printSection(title: string, lines: string[]) {
  const width = Math.max(title.length, ...lines.map((line) => line.length)) + 4;
  const horizontal = "-".repeat(width);

  console.log("");
  console.log(color(36, `+${horizontal}+`));
  console.log(color(36, `|  ${title.padEnd(width - 2, " ")}|`));
  console.log(color(36, `+${horizontal}+`));

  for (const line of lines) {
    console.log(`  ${line}`);
  }
}

function printStarted(runtime: Awaited<ReturnType<typeof manager.start>>) {
  printSection(appLabel, [
    `${padLabel("Status")}${color(32, "running")}`,
    `${padLabel("Local UI")}http://127.0.0.1:${config.port}`,
    `${padLabel("LAN URL")}${runtime.url}`,
    `${padLabel("Data dir")}${config.dataDir}`,
    `${padLabel("Started")}${new Date(runtime.startedAt).toLocaleString()}`
  ]);

  if (isDevMode) {
    console.log(`  ${color(90, "Tip")} Stop the desktop app first if dev mode says the port is already in use.`);
    console.log("");
  }
}

function printStartupError(error: unknown) {
  const nodeError = error as NodeJS.ErrnoException;

  if (nodeError?.code === "EADDRINUSE") {
    printSection(appLabel, [
      `${padLabel("Status")}${color(31, "startup failed")}`,
      `${padLabel("Reason")}Port ${config.port} is already in use on ${config.host}`,
      `${padLabel("Likely")}Desktop app or another dev server is still running`,
      `${padLabel("Try")}lsof -iTCP:${config.port} -sTCP:LISTEN`,
      `${padLabel("Or")}PORT=${config.port + 1} npm run dev`
    ]);
    return;
  }

  printSection(appLabel, [
    `${padLabel("Status")}${color(31, "startup failed")}`,
    `${padLabel("Reason")}${error instanceof Error ? error.message : "Unknown error"}`
  ]);
  console.error(error);
}

try {
  const runtime = await manager.start();
  printStarted(runtime);
} catch (error) {
  printStartupError(error);
  process.exit(1);
}

process.on("SIGINT", async () => {
  await manager.stop();
  console.log(color(90, `${appLabel} stopped.`));
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await manager.stop();
  console.log(color(90, `${appLabel} stopped.`));
  process.exit(0);
});
