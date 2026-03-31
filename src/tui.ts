import os from "node:os";
import { config, detectExternalIPv4Addresses } from "./config.js";
import { openExternalUrl } from "./platform.js";
import { AppStorage } from "./storage.js";
import { discoverUpnpDevices, type DiscoveredDevice } from "./upnp/discovery.js";

export type ServerManager = {
  start(): Promise<{
    url: string;
    startedAt: string;
  }>;
  stop(): Promise<void>;
  refreshNetworkBindings(): Promise<{
    running: boolean;
    url: string;
    startedAt?: string;
  }>;
  getState(): {
    running: boolean;
    url: string;
    startedAt?: string;
  };
};

type LogLevel = "info" | "success" | "warning" | "error";

type LogEntry = {
  message: string;
  level: LogLevel;
  timestamp: string;
};

type DiscoveryState =
  | { status: "idle"; devices: DiscoveredDevice[]; lastCheckedAt?: string }
  | { status: "running"; devices: DiscoveredDevice[]; lastCheckedAt?: string }
  | { status: "done"; devices: DiscoveredDevice[]; lastCheckedAt: string }
  | { status: "error"; devices: DiscoveredDevice[]; lastCheckedAt: string; message: string };

type RuntimeSnapshot = {
  favoritesCount: number;
  libraryFoldersCount: number;
  dataDir: string;
  hostname: string;
  networkAddresses: string[];
};

const MAX_LOG_ENTRIES = 6;

function color(code: number, value: string): string {
  return process.stdout.isTTY && !process.env.NO_COLOR
    ? `\u001b[${code}m${value}\u001b[0m`
    : value;
}

function dim(value: string): string {
  return color(90, value);
}

function tone(level: LogLevel, value: string): string {
  if (level === "success") {
    return color(32, value);
  }

  if (level === "warning") {
    return color(33, value);
  }

  if (level === "error") {
    return color(31, value);
  }

  return color(36, value);
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function visibleLength(value: string): number {
  return stripAnsi(value).length;
}

function truncate(value: string, maxLength: number): string {
  if (visibleLength(value) <= maxLength) {
    return value;
  }

  return `${stripAnsi(value).slice(0, Math.max(0, maxLength - 1))}…`;
}

function pad(value: string, width: number): string {
  const clean = truncate(value, width);
  return `${clean}${" ".repeat(Math.max(0, width - visibleLength(clean)))}`;
}

function frame(title: string, lines: string[], width: number): string[] {
  const innerWidth = Math.max(24, width - 4);
  const top = `┌${"─".repeat(innerWidth)}┐`;
  const label = ` ${title} `;
  const titledTop = `┌${label}${"─".repeat(Math.max(0, innerWidth - visibleLength(label)))}┐`;
  const rows = lines.map((line) => `│ ${pad(line, innerWidth - 1)}│`);
  return [titledTop || top, ...rows, `└${"─".repeat(innerWidth)}┘`];
}

function buildBanner(width: number): string[] {
  const headline = color(36, "Caruso Reborn");
  const subtitle = dim("Terminal-first control room");
  return frame("Overview", [headline, subtitle], width);
}

function buildStatusLines(manager: ServerManager): string[] {
  const state = manager.getState();
  const status = state.running ? tone("success", "Running") : tone("warning", "Stopped");
  const startedAt = state.startedAt ? new Date(state.startedAt).toLocaleString() : "Not started";

  return [
    `Status      ${status}`,
    `Local UI    http://127.0.0.1:${config.port}`,
    `LAN URL     ${state.url}`,
    `Started     ${startedAt}`
  ];
}

function buildEnvironmentLines(snapshot: RuntimeSnapshot): string[] {
  return [
    `Data dir    ${snapshot.dataDir}`,
    `Host        ${snapshot.hostname}`,
    `Addresses   ${snapshot.networkAddresses.join(", ") || "No LAN address detected"}`,
    `Library     ${snapshot.libraryFoldersCount} folder(s)`,
    `Favorites   ${snapshot.favoritesCount} saved station(s)`
  ];
}

function buildDiscoveryLines(discovery: DiscoveryState): string[] {
  if (discovery.status === "running") {
    return [
      tone("info", "Looking for renderers on the local network..."),
      dim("This can take a few seconds.")
    ];
  }

  if (discovery.status === "error") {
    return [
      tone("error", discovery.message),
      `Last check  ${new Date(discovery.lastCheckedAt).toLocaleTimeString()}`
    ];
  }

  if (discovery.devices.length === 0) {
    return [
      "No renderer discovered yet.",
      discovery.lastCheckedAt
        ? `Last check  ${new Date(discovery.lastCheckedAt).toLocaleTimeString()}`
        : "Press d to run discovery."
    ];
  }

  const listed = discovery.devices.slice(0, 3).map((device, index) =>
    `${index + 1}. ${device.st || device.server || "Unknown device"} ${dim(`(${device.address})`)}`
  );

  if (discovery.devices.length > 3) {
    listed.push(dim(`+${discovery.devices.length - 3} more device(s)`));
  }

  return [
    ...listed,
    `Last check  ${new Date(discovery.lastCheckedAt ?? Date.now()).toLocaleTimeString()}`
  ];
}

function buildActionLines(): string[] {
  return [
    `${tone("info", "[s]")} start/stop bridge`,
    `${tone("info", "[d]")} discover Caruso renderers`,
    `${tone("info", "[b]")} open browser dashboard`,
    `${tone("info", "[r]")} refresh network binding`,
    `${tone("info", "[q]")} quit`
  ];
}

function buildLogLines(entries: LogEntry[]): string[] {
  if (entries.length === 0) {
    return [dim("No activity yet.")];
  }

  return entries.map((entry) =>
    `${dim(entry.timestamp)} ${tone(entry.level, entry.message)}`
  );
}

async function readSnapshot(dataDir: string): Promise<RuntimeSnapshot> {
  const storage = new AppStorage(dataDir);
  const [favorites, folders] = await Promise.all([
    storage.getTuneInFavorites(),
    storage.getLibraryFolders()
  ]);

  return {
    favoritesCount: favorites.length,
    libraryFoldersCount: folders.length,
    dataDir,
    hostname: os.hostname(),
    networkAddresses: detectExternalIPv4Addresses()
  };
}

export async function runTerminalUi(manager: ServerManager, options: {
  dataDir: string;
  appLabel: string;
  isDevMode?: boolean;
}) {
  const logs: LogEntry[] = [];
  let discovery: DiscoveryState = { status: "idle", devices: [] };
  let snapshot = await readSnapshot(options.dataDir);
  let isBusy = false;
  let renderTimer: NodeJS.Timeout | undefined;
  let shuttingDown = false;

  const pushLog = (message: string, level: LogLevel = "info") => {
    logs.unshift({
      message,
      level,
      timestamp: new Date().toLocaleTimeString()
    });
    logs.splice(MAX_LOG_ENTRIES);
  };

  const render = () => {
    const width = Math.min(Math.max(process.stdout.columns || 96, 72), 120);
    const sections = [
      ...buildBanner(width),
      "",
      ...frame("Bridge", buildStatusLines(manager), width),
      "",
      ...frame("Environment", buildEnvironmentLines(snapshot), width),
      "",
      ...frame("Discovery", buildDiscoveryLines(discovery), width),
      "",
      ...frame("Actions", buildActionLines(), width),
      "",
      ...frame("Activity", buildLogLines(logs), width)
    ];

    const footer = dim(`${options.appLabel}  •  terminal-first mode${options.isDevMode ? "  •  dev" : ""}`);
    process.stdout.write("\u001b[2J\u001b[H");
    process.stdout.write(`${sections.join("\n")}\n\n${footer}\n`);
  };

  const refreshSnapshot = async () => {
    snapshot = await readSnapshot(options.dataDir);
  };

  const withBusyState = async (action: () => Promise<void>) => {
    if (isBusy) {
      pushLog("Still working on the previous action.", "warning");
      render();
      return;
    }

    isBusy = true;
    try {
      await action();
    } finally {
      isBusy = false;
      render();
    }
  };

  const runDiscovery = async () => {
    discovery = {
      status: "running",
      devices: discovery.devices,
      lastCheckedAt: discovery.lastCheckedAt
    };
    render();

    try {
      const devices = await discoverUpnpDevices();
      discovery = {
        status: "done",
        devices,
        lastCheckedAt: new Date().toISOString()
      };
      pushLog(
        devices.length > 0
          ? `${devices.length} renderer(s) discovered.`
          : "Discovery finished without finding a renderer.",
        devices.length > 0 ? "success" : "warning"
      );
    } catch (error) {
      discovery = {
        status: "error",
        devices: [],
        lastCheckedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : "Renderer discovery failed."
      };
      pushLog("Renderer discovery failed.", "error");
    }
  };

  const cleanup = async () => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    if (renderTimer) {
      clearInterval(renderTimer);
    }

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }

    process.stdin.removeAllListeners("data");
    process.removeListener("SIGINT", handleSigint);
    process.removeListener("SIGTERM", handleSigterm);
    if (process.stdout.isTTY) {
      process.stdout.write("\u001b[2J\u001b[H");
    }
    await manager.stop();
    process.exit(0);
  };

  const handleSigint = () => {
    void cleanup();
  };

  const handleSigterm = () => {
    void cleanup();
  };

  pushLog("Starting bridge...", "info");
  await manager.start();
  await refreshSnapshot();
  pushLog("Bridge is running.", "success");

  process.on("SIGINT", handleSigint);
  process.on("SIGTERM", handleSigterm);

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log(`${options.appLabel} running at http://127.0.0.1:${config.port}`);
    console.log(`LAN URL: ${manager.getState().url}`);
    return;
  }

  render();

  renderTimer = setInterval(() => {
    void refreshSnapshot()
      .then(() => render())
      .catch(() => undefined);
  }, 4000);

  process.stdin.removeAllListeners("data");
  process.stdin.resume();
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  process.stdin.on("data", (chunk: Buffer | string) => {
    const raw = typeof chunk === "string" ? chunk : chunk.toString("utf8");

    if (raw.length !== 1) {
      return;
    }

    if (raw === "\u0003" || raw === "q") {
      void cleanup();
      return;
    }

    if (raw === "s") {
      void withBusyState(async () => {
        if (manager.getState().running) {
          await manager.stop();
          pushLog("Bridge stopped.", "warning");
        } else {
          await manager.start();
          pushLog("Bridge started.", "success");
        }
        await refreshSnapshot();
      });
      return;
    }

    if (raw === "b") {
      void withBusyState(async () => {
        if (!manager.getState().running) {
          await manager.start();
          pushLog("Bridge started for browser access.", "success");
        }

        openExternalUrl(`http://127.0.0.1:${config.port}`);
        pushLog("Browser opened.", "success");
      });
      return;
    }

    if (raw === "r") {
      void withBusyState(async () => {
        await manager.refreshNetworkBindings();
        await refreshSnapshot();
        pushLog("Network binding refreshed.", "success");
      });
      return;
    }

    if (raw === "d") {
      void withBusyState(async () => {
        await runDiscovery();
      });
    }
  });

}
