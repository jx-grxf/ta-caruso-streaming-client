import dgram from "node:dgram";
import { detectExternalIPv4Addresses } from "../config.js";

export type DiscoveredDevice = {
  address: string;
  usn?: string;
  st?: string;
  location?: string;
  server?: string;
};

export async function discoverUpnpDevices(timeoutMs = 3000): Promise<DiscoveredDevice[]> {
  return new Promise((resolve, reject) => {
    const interfaces = detectExternalIPv4Addresses();
    const sockets = (interfaces.length > 0 ? interfaces : [undefined]).map((address) => ({
      address,
      socket: dgram.createSocket({ type: "udp4", reuseAddr: true }),
      bindingResolved: false
    }));
    const devices = new Map<string, DiscoveredDevice>();
    let settled = false;
    let pendingBindings = sockets.length;
    let successfulBindings = 0;
    let firstBindingError: Error | undefined;

    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      for (const entry of sockets) {
        entry.socket.close();
      }
      resolve([...devices.values()]);
    };

    const maybeStartTimeout = () => {
      if (pendingBindings !== 0 || settled) {
        return;
      }

      if (successfulBindings === 0) {
        settled = true;
        for (const entry of sockets) {
          entry.socket.close();
        }
        reject(firstBindingError ?? new Error("Could not bind a UDP discovery socket on any active IPv4 interface."));
        return;
      }

      setTimeout(() => {
        finish();
      }, timeoutMs);
    };

    for (const entry of sockets) {
      entry.socket.on("error", (error) => {
        if (settled) {
          return;
        }

        if (!entry.bindingResolved) {
          entry.bindingResolved = true;
          firstBindingError ??= error;
          pendingBindings -= 1;
          maybeStartTimeout();
          return;
        }
      });

      entry.socket.on("message", (message, remote) => {
        const raw = message.toString("utf8");
        const headers = parseSsdpHeaders(raw);
        const key = headers.usn ?? headers.location ?? `${remote.address}-${headers.st ?? "unknown"}`;

        devices.set(key, {
          address: remote.address,
          usn: headers.usn,
          st: headers.st,
          location: headers.location,
          server: headers.server
        });
      });

      entry.socket.bind({
        port: 0,
        address: entry.address
      }, () => {
        entry.bindingResolved = true;
        pendingBindings -= 1;
        successfulBindings += 1;
        entry.socket.setMulticastTTL(2);
        if (entry.address) {
          entry.socket.setMulticastInterface(entry.address);
        }

        for (const searchTarget of [
          "ssdp:all",
          "upnp:rootdevice",
          "urn:schemas-upnp-org:device:MediaRenderer:1",
          "urn:schemas-upnp-org:service:AVTransport:1"
        ]) {
          const payload = [
            "M-SEARCH * HTTP/1.1",
            "HOST: 239.255.255.250:1900",
            'MAN: "ssdp:discover"',
            "MX: 1",
            `ST: ${searchTarget}`,
            "",
            ""
          ].join("\r\n");

          entry.socket.send(payload, 1900, "239.255.255.250");
        }

        maybeStartTimeout();
      });
    }
  });
}

function parseSsdpHeaders(raw: string): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const line of raw.split("\r\n")) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    headers[key] = value;
  }

  return headers;
}
