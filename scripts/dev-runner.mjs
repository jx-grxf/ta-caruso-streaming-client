import net from "node:net";
import os from "node:os";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

function parsePort(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isPortAvailable(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => {
      resolve(false);
    });

    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port, host);
  });
}

async function findAvailablePort(startPort, host, attempts = 20) {
  for (let offset = 0; offset < attempts; offset += 1) {
    const port = startPort + offset;
    if (await isPortAvailable(port, host)) {
      return port;
    }
  }

  throw new Error(`No free port found between ${startPort} and ${startPort + attempts - 1}.`);
}

function detectExternalAddress() {
  const addresses = [];

  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      const normalizedName = name.toLowerCase();
      const isVirtualInterface =
        normalizedName.includes("tailscale") ||
        normalizedName.includes("openvpn") ||
        normalizedName.includes("surfshark") ||
        normalizedName.includes("wireguard") ||
        normalizedName.includes("vmware") ||
        normalizedName.includes("virtualbox") ||
        normalizedName.includes("hyper-v") ||
        normalizedName.includes("loopback");
      const isCarrierGradeNat = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(entry.address);

      if (entry.family === "IPv4" && !entry.internal && !entry.address.startsWith("169.254.") && !isVirtualInterface && !isCarrierGradeNat) {
        addresses.push(entry.address);
      }
    }
  }

  return addresses.sort((left, right) => left.localeCompare(right))[0] || "127.0.0.1";
}

function parseBooleanFlag(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  return !["0", "false", "no", "off"].includes(String(value).toLowerCase());
}

function parseCliArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) {
      continue;
    }

    const keyValue = current.slice(2).split("=");
    const key = keyValue[0];
    const inlineValue = keyValue[1];
    const nextValue = inlineValue ?? argv[index + 1];

    if (inlineValue === undefined && nextValue && !nextValue.startsWith("--")) {
      parsed[key] = nextValue;
      index += 1;
      continue;
    }

    parsed[key] = inlineValue ?? "true";
  }

  return parsed;
}

const cliArgs = parseCliArgs(process.argv.slice(2));
const require = createRequire(import.meta.url);
const tsxCliPath = require.resolve("tsx/cli");

const requestedPort = parsePort(process.env.PORT, 3847);
const host = process.env.HOST || "0.0.0.0";
const selectedPort = await findAvailablePort(requestedPort, host);
const publicHost = host === "0.0.0.0" || host === "::" ? detectExternalAddress() : host;
const publicBaseUrl = `http://${publicHost}:${selectedPort}`;
const appEntry = cliArgs.entry || process.env.APP_ENTRY || "src/index.ts";
const watchMode = parseBooleanFlag(cliArgs.watch ?? process.env.WATCH_MODE, true);

if (selectedPort !== requestedPort) {
  console.log("");
  console.log(`[dev] Port ${requestedPort} is busy, switching to ${selectedPort}.`);
  console.log(`[dev] Local UI: http://127.0.0.1:${selectedPort}`);
  console.log("");
}

const child = spawn(process.execPath, [tsxCliPath, ...(watchMode ? ["watch"] : []), appEntry], {
  stdio: "inherit",
  env: {
    ...process.env,
    PORT: String(selectedPort),
    PUBLIC_BASE_URL: publicBaseUrl,
    DEV_MODE: "1"
  }
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
