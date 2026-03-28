import dgram from "node:dgram";

export type DiscoveredDevice = {
  address: string;
  usn?: string;
  st?: string;
  location?: string;
  server?: string;
};

export async function discoverUpnpDevices(timeoutMs = 3000): Promise<DiscoveredDevice[]> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    const devices = new Map<string, DiscoveredDevice>();

    socket.on("error", (error) => {
      socket.close();
      reject(error);
    });

    socket.on("message", (message, remote) => {
      const raw = message.toString("utf8");
      const headers = parseSsdpHeaders(raw);
      const key = headers.usn ?? `${remote.address}-${headers.location ?? "unknown"}`;

      devices.set(key, {
        address: remote.address,
        usn: headers.usn,
        st: headers.st,
        location: headers.location,
        server: headers.server
      });
    });

    socket.bind(0, () => {
      const payload = [
        "M-SEARCH * HTTP/1.1",
        "HOST: 239.255.255.250:1900",
        'MAN: "ssdp:discover"',
        "MX: 1",
        "ST: ssdp:all",
        "",
        ""
      ].join("\r\n");

      socket.send(payload, 1900, "239.255.255.250");

      setTimeout(() => {
        socket.close();
        resolve([...devices.values()]);
      }, timeoutMs);
    });
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
