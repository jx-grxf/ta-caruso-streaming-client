import dgram from "node:dgram";
import os from "node:os";

export type DiscoveredDevice = {
  address: string;
  usn?: string;
  st?: string;
  location?: string;
  server?: string;
};

export async function discoverUpnpDevices(timeoutMs = 3000): Promise<DiscoveredDevice[]> {
  return new Promise((resolve, reject) => {
    const interfaces = detectExternalIpv4Addresses();
    const sockets = (interfaces.length > 0 ? interfaces : [undefined]).map((address) => ({
      address,
      socket: dgram.createSocket({ type: "udp4", reuseAddr: true })
    }));
    const devices = new Map<string, DiscoveredDevice>();
    let settled = false;
    let remainingBindings = sockets.length;

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

    for (const entry of sockets) {
      entry.socket.on("error", (error) => {
        if (settled) {
          return;
        }

        if (remainingBindings > 0) {
          remainingBindings -= 1;
          if (remainingBindings === 0) {
            settled = true;
            for (const socketEntry of sockets) {
              socketEntry.socket.close();
            }
            reject(error);
          }
          return;
        }

        finish();
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

        remainingBindings -= 1;
        if (remainingBindings === 0) {
          setTimeout(() => {
            finish();
          }, timeoutMs);
        }
      });
    }
  });
}

function detectExternalIpv4Addresses(): string[] {
  const addresses: string[] = [];

  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal && !entry.address.startsWith("169.254.")) {
        addresses.push(entry.address);
      }
    }
  }

  return [...new Set(addresses)];
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
