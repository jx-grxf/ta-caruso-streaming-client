import crypto from "node:crypto";
import dgram from "node:dgram";
import { XMLParser } from "fast-xml-parser";
import type { LocalTrack } from "../local-library.js";
import { browseDirectory } from "../providers/tunein.js";
import type { TuneInFavorite } from "../storage.js";

const DEVICE_TYPE = "urn:schemas-upnp-org:device:MediaServer:1";
const CONTENT_DIRECTORY_TYPE = "urn:schemas-upnp-org:service:ContentDirectory:1";
const CONNECTION_MANAGER_TYPE = "urn:schemas-upnp-org:service:ConnectionManager:1";

export type BrowseContext = {
  serverName: string;
  baseUrl: string;
  tracks: LocalTrack[];
  favorites: TuneInFavorite[];
};

type BrowseContainer = {
  kind: "container";
  id: string;
  parentId: string;
  title: string;
  children: string[];
  upnpClass: string;
};

type BrowseItem = {
  kind: "item";
  id: string;
  parentId: string;
  title: string;
  url: string;
  mimeType: string;
  upnpClass: string;
};

type BrowseNode = BrowseContainer | BrowseItem;

export function createMediaServerUuid(seed: string): string {
  const hash = crypto.createHash("sha1").update(seed).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

export function getDeviceDescriptionXml(options: {
  baseUrl: string;
  serverUuid: string;
  friendlyName: string;
}): string {
  const { baseUrl, serverUuid, friendlyName } = options;

  return `<?xml version="1.0" encoding="utf-8"?>
<root xmlns="urn:schemas-upnp-org:device-1-0" xmlns:dlna="urn:schemas-dlna-org:device-1-0">
  <specVersion>
    <major>1</major>
    <minor>0</minor>
  </specVersion>
  <URLBase>${escapeXml(baseUrl)}</URLBase>
  <device>
    <deviceType>${DEVICE_TYPE}</deviceType>
    <friendlyName>${escapeXml(friendlyName)}</friendlyName>
    <manufacturer>Codex</manufacturer>
    <manufacturerURL>https://openai.com</manufacturerURL>
    <modelDescription>Local streaming bridge for T+A Caruso</modelDescription>
    <modelName>Caruso Bridge</modelName>
    <modelNumber>0.2.0</modelNumber>
    <serialNumber>${escapeXml(serverUuid)}</serialNumber>
    <UDN>uuid:${escapeXml(serverUuid)}</UDN>
    <dlna:X_DLNADOC>DMS-1.50</dlna:X_DLNADOC>
    <dlna:X_DLNACAP></dlna:X_DLNACAP>
    <serviceList>
      <service>
        <serviceType>${CONTENT_DIRECTORY_TYPE}</serviceType>
        <serviceId>urn:upnp-org:serviceId:ContentDirectory</serviceId>
        <SCPDURL>/upnp/content-directory.xml</SCPDURL>
        <controlURL>/upnp/control/content-directory</controlURL>
        <eventSubURL>/upnp/event/content-directory</eventSubURL>
      </service>
      <service>
        <serviceType>${CONNECTION_MANAGER_TYPE}</serviceType>
        <serviceId>urn:upnp-org:serviceId:ConnectionManager</serviceId>
        <SCPDURL>/upnp/connection-manager.xml</SCPDURL>
        <controlURL>/upnp/control/connection-manager</controlURL>
        <eventSubURL>/upnp/event/connection-manager</eventSubURL>
      </service>
    </serviceList>
  </device>
</root>`;
}

export function getContentDirectoryScpdXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<scpd xmlns="urn:schemas-upnp-org:service-1-0">
  <specVersion><major>1</major><minor>0</minor></specVersion>
  <actionList>
    <action>
      <name>Browse</name>
      <argumentList>
        <argument><name>ObjectID</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_ObjectID</relatedStateVariable></argument>
        <argument><name>BrowseFlag</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_BrowseFlag</relatedStateVariable></argument>
        <argument><name>Filter</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_Filter</relatedStateVariable></argument>
        <argument><name>StartingIndex</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_Index</relatedStateVariable></argument>
        <argument><name>RequestedCount</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_Count</relatedStateVariable></argument>
        <argument><name>SortCriteria</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_SortCriteria</relatedStateVariable></argument>
        <argument><name>Result</name><direction>out</direction><relatedStateVariable>A_ARG_TYPE_Result</relatedStateVariable></argument>
        <argument><name>NumberReturned</name><direction>out</direction><relatedStateVariable>A_ARG_TYPE_Count</relatedStateVariable></argument>
        <argument><name>TotalMatches</name><direction>out</direction><relatedStateVariable>A_ARG_TYPE_Count</relatedStateVariable></argument>
        <argument><name>UpdateID</name><direction>out</direction><relatedStateVariable>A_ARG_TYPE_UpdateID</relatedStateVariable></argument>
      </argumentList>
    </action>
    <action>
      <name>GetSearchCapabilities</name>
      <argumentList>
        <argument><name>SearchCaps</name><direction>out</direction><relatedStateVariable>A_ARG_TYPE_SearchCaps</relatedStateVariable></argument>
      </argumentList>
    </action>
    <action>
      <name>GetSortCapabilities</name>
      <argumentList>
        <argument><name>SortCaps</name><direction>out</direction><relatedStateVariable>A_ARG_TYPE_SortCaps</relatedStateVariable></argument>
      </argumentList>
    </action>
    <action>
      <name>GetSystemUpdateID</name>
      <argumentList>
        <argument><name>Id</name><direction>out</direction><relatedStateVariable>A_ARG_TYPE_UpdateID</relatedStateVariable></argument>
      </argumentList>
    </action>
  </actionList>
  <serviceStateTable>
    <stateVariable sendEvents="no"><name>A_ARG_TYPE_ObjectID</name><dataType>string</dataType></stateVariable>
    <stateVariable sendEvents="no"><name>A_ARG_TYPE_BrowseFlag</name><dataType>string</dataType></stateVariable>
    <stateVariable sendEvents="no"><name>A_ARG_TYPE_Filter</name><dataType>string</dataType></stateVariable>
    <stateVariable sendEvents="no"><name>A_ARG_TYPE_Index</name><dataType>ui4</dataType></stateVariable>
    <stateVariable sendEvents="no"><name>A_ARG_TYPE_Count</name><dataType>ui4</dataType></stateVariable>
    <stateVariable sendEvents="no"><name>A_ARG_TYPE_SortCriteria</name><dataType>string</dataType></stateVariable>
    <stateVariable sendEvents="no"><name>A_ARG_TYPE_Result</name><dataType>string</dataType></stateVariable>
    <stateVariable sendEvents="no"><name>A_ARG_TYPE_UpdateID</name><dataType>ui4</dataType></stateVariable>
    <stateVariable sendEvents="no"><name>A_ARG_TYPE_SearchCaps</name><dataType>string</dataType></stateVariable>
    <stateVariable sendEvents="no"><name>A_ARG_TYPE_SortCaps</name><dataType>string</dataType></stateVariable>
  </serviceStateTable>
</scpd>`;
}

export function getConnectionManagerScpdXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<scpd xmlns="urn:schemas-upnp-org:service-1-0">
  <specVersion><major>1</major><minor>0</minor></specVersion>
  <actionList>
    <action>
      <name>GetProtocolInfo</name>
      <argumentList>
        <argument><name>Source</name><direction>out</direction><relatedStateVariable>SourceProtocolInfo</relatedStateVariable></argument>
        <argument><name>Sink</name><direction>out</direction><relatedStateVariable>SinkProtocolInfo</relatedStateVariable></argument>
      </argumentList>
    </action>
    <action>
      <name>GetCurrentConnectionIDs</name>
      <argumentList>
        <argument><name>ConnectionIDs</name><direction>out</direction><relatedStateVariable>CurrentConnectionIDs</relatedStateVariable></argument>
      </argumentList>
    </action>
    <action>
      <name>GetCurrentConnectionInfo</name>
      <argumentList>
        <argument><name>ConnectionID</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_ConnectionID</relatedStateVariable></argument>
        <argument><name>RcsID</name><direction>out</direction><relatedStateVariable>A_ARG_TYPE_RcsID</relatedStateVariable></argument>
        <argument><name>AVTransportID</name><direction>out</direction><relatedStateVariable>A_ARG_TYPE_AVTransportID</relatedStateVariable></argument>
        <argument><name>ProtocolInfo</name><direction>out</direction><relatedStateVariable>A_ARG_TYPE_ProtocolInfo</relatedStateVariable></argument>
        <argument><name>PeerConnectionManager</name><direction>out</direction><relatedStateVariable>A_ARG_TYPE_ConnectionManager</relatedStateVariable></argument>
        <argument><name>PeerConnectionID</name><direction>out</direction><relatedStateVariable>A_ARG_TYPE_ConnectionID</relatedStateVariable></argument>
        <argument><name>Direction</name><direction>out</direction><relatedStateVariable>A_ARG_TYPE_Direction</relatedStateVariable></argument>
        <argument><name>Status</name><direction>out</direction><relatedStateVariable>A_ARG_TYPE_ConnectionStatus</relatedStateVariable></argument>
      </argumentList>
    </action>
  </actionList>
  <serviceStateTable>
    <stateVariable sendEvents="no"><name>SourceProtocolInfo</name><dataType>string</dataType></stateVariable>
    <stateVariable sendEvents="no"><name>SinkProtocolInfo</name><dataType>string</dataType></stateVariable>
    <stateVariable sendEvents="no"><name>CurrentConnectionIDs</name><dataType>string</dataType></stateVariable>
    <stateVariable sendEvents="no"><name>A_ARG_TYPE_ConnectionID</name><dataType>i4</dataType></stateVariable>
    <stateVariable sendEvents="no"><name>A_ARG_TYPE_RcsID</name><dataType>i4</dataType></stateVariable>
    <stateVariable sendEvents="no"><name>A_ARG_TYPE_AVTransportID</name><dataType>i4</dataType></stateVariable>
    <stateVariable sendEvents="no"><name>A_ARG_TYPE_ProtocolInfo</name><dataType>string</dataType></stateVariable>
    <stateVariable sendEvents="no"><name>A_ARG_TYPE_ConnectionManager</name><dataType>string</dataType></stateVariable>
    <stateVariable sendEvents="no"><name>A_ARG_TYPE_Direction</name><dataType>string</dataType></stateVariable>
    <stateVariable sendEvents="no"><name>A_ARG_TYPE_ConnectionStatus</name><dataType>string</dataType></stateVariable>
  </serviceStateTable>
</scpd>`;
}

export function parseSoapAction(xml: string): {
  actionName: string;
  args: Record<string, string>;
} {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: ""
  });

  const parsed = parser.parse(xml) as Record<string, unknown>;
  const envelope = getAny(parsed, ["s:Envelope", "Envelope"]) as Record<string, unknown> | undefined;
  const body = getAny(envelope ?? parsed, ["s:Body", "Body"]) as Record<string, unknown> | undefined;

  if (!body) {
    throw new Error("Invalid SOAP request.");
  }

  const [actionName, actionBody] = Object.entries(body)[0] ?? [];
  if (!actionName || typeof actionBody !== "object" || !actionBody) {
    throw new Error("SOAP action missing.");
  }

  const normalizedName = actionName.includes(":") ? actionName.split(":").at(-1)! : actionName;
  const args = Object.fromEntries(
    Object.entries(actionBody as Record<string, unknown>).map(([key, value]) => [
      key.includes(":") ? key.split(":").at(-1)! : key,
      String(value)
    ])
  );

  return {
    actionName: normalizedName,
    args
  };
}

const TUNEIN_ROOT_CATEGORIES = [
  { title: "Local Radio", url: "https://opml.radiotime.com/Browse.ashx?c=local&render=xml" },
  { title: "Music", url: "https://opml.radiotime.com/Browse.ashx?c=music&render=xml" },
  { title: "Talk", url: "https://opml.radiotime.com/Browse.ashx?c=talk&render=xml" },
  { title: "Sports", url: "https://opml.radiotime.com/Browse.ashx?c=sports&render=xml" },
  { title: "By Location", url: "https://opml.radiotime.com/Browse.ashx?id=r0&render=xml" },
  { title: "By Language", url: "https://opml.radiotime.com/Browse.ashx?c=lang&render=xml" },
  { title: "Podcasts", url: "https://opml.radiotime.com/Browse.ashx?c=podcast&render=xml" }
];
const MAX_TUNEIN_BROWSE_ITEMS = 60;

function isAllowedTuneInBrowseUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return ["http:", "https:"].includes(parsed.protocol) && parsed.hostname === "opml.radiotime.com";
  } catch {
    return false;
  }
}

export async function buildContentDirectoryBrowseResponse(
  args: Record<string, string>,
  context: BrowseContext
): Promise<string> {
  const objectId = args.ObjectID ?? "0";
  const browseFlag = args.BrowseFlag ?? "BrowseDirectChildren";
  const startingIndex = Number(args.StartingIndex ?? "0");
  const requestedCount = Number(args.RequestedCount ?? "0");
  const tree = await buildBrowseTree(context, objectId).catch(() => buildFallbackBrowseTree(context));
  const node = tree.get(objectId);

  if (!node) {
    return soapEnvelope("u:BrowseResponse", CONTENT_DIRECTORY_TYPE, {
      Result: wrapDidl(""),
      NumberReturned: "0",
      TotalMatches: "0",
      UpdateID: "1"
    });
  }

  const entries = browseFlag === "BrowseMetadata"
    ? [node]
    : node.kind === "container"
      ? node.children.map((childId) => tree.get(childId)).filter(Boolean) as BrowseNode[]
      : [];

  const paged = requestedCount > 0
    ? entries.slice(startingIndex, startingIndex + requestedCount)
    : entries.slice(startingIndex);

  const didl = wrapDidl(paged.map((entry) => serializeNode(entry)).join(""));

  return soapEnvelope("u:BrowseResponse", CONTENT_DIRECTORY_TYPE, {
    Result: didl,
    NumberReturned: String(paged.length),
    TotalMatches: String(entries.length),
    UpdateID: "1"
  });
}

export function buildContentDirectorySystemUpdateIdResponse(): string {
  return soapEnvelope("u:GetSystemUpdateIDResponse", CONTENT_DIRECTORY_TYPE, {
    Id: "1"
  });
}

export function buildContentDirectoryCapabilitiesResponse(actionName: string): string {
  if (actionName === "GetSearchCapabilities") {
    return soapEnvelope("u:GetSearchCapabilitiesResponse", CONTENT_DIRECTORY_TYPE, {
      SearchCaps: ""
    });
  }

  if (actionName === "GetSortCapabilities") {
    return soapEnvelope("u:GetSortCapabilitiesResponse", CONTENT_DIRECTORY_TYPE, {
      SortCaps: "dc:title"
    });
  }

  throw new Error(`Unsupported ContentDirectory action ${actionName}.`);
}

export function buildConnectionManagerResponse(actionName: string): string {
  if (actionName === "GetProtocolInfo") {
    return soapEnvelope("u:GetProtocolInfoResponse", CONNECTION_MANAGER_TYPE, {
      Source: "http-get:*:audio/mpeg:DLNA.ORG_PN=MP3;DLNA.ORG_OP=01;DLNA.ORG_FLAGS=01700000000000000000000000000000,http-get:*:audio/flac:*,http-get:*:audio/aac:*",
      Sink: ""
    });
  }

  if (actionName === "GetCurrentConnectionIDs") {
    return soapEnvelope("u:GetCurrentConnectionIDsResponse", CONNECTION_MANAGER_TYPE, {
      ConnectionIDs: "0"
    });
  }

  if (actionName === "GetCurrentConnectionInfo") {
    return soapEnvelope("u:GetCurrentConnectionInfoResponse", CONNECTION_MANAGER_TYPE, {
      RcsID: "-1",
      AVTransportID: "-1",
      ProtocolInfo: "",
      PeerConnectionManager: "",
      PeerConnectionID: "-1",
      Direction: "Output",
      Status: "OK"
    });
  }

  throw new Error(`Unsupported ConnectionManager action ${actionName}.`);
}

export function createSsdpServer(options: {
  locations: Array<{
    address: string;
    baseUrl: string;
  }>;
  serverUuid: string;
  friendlyName: string;
}) {
  const sockets = options.locations.map((locationConfig) => ({
    address: locationConfig.address,
    baseUrl: locationConfig.baseUrl,
    socket: dgram.createSocket({ type: "udp4", reuseAddr: true })
  }));
  const ntsTargets = [
    "upnp:rootdevice",
    `uuid:${options.serverUuid}`,
    DEVICE_TYPE,
    CONTENT_DIRECTORY_TYPE,
    CONNECTION_MANAGER_TYPE
  ];
  let notifyInterval: NodeJS.Timeout | undefined;

  function formatSsdpResponse(location: string, st: string) {
    const usn = st === "upnp:rootdevice"
      ? `uuid:${options.serverUuid}::upnp:rootdevice`
      : st === `uuid:${options.serverUuid}`
        ? `uuid:${options.serverUuid}`
        : `uuid:${options.serverUuid}::${st}`;

    return [
      "HTTP/1.1 200 OK",
      "CACHE-CONTROL: max-age=1800",
      "EXT:",
      `LOCATION: ${location}`,
      "SERVER: macOS/13.0 UPnP/1.0 CarusoBridge/0.2.0 DLNADOC/1.50",
      `ST: ${st}`,
      `USN: ${usn}`,
      "",
      ""
    ].join("\r\n");
  }

  function sendNotify(nts: "ssdp:alive" | "ssdp:byebye") {
    for (const entry of sockets) {
      const location = `${entry.baseUrl}/upnp/device-description.xml`;
      for (const nt of ntsTargets) {
      const usn = nt === "upnp:rootdevice"
        ? `uuid:${options.serverUuid}::upnp:rootdevice`
        : nt === `uuid:${options.serverUuid}`
          ? `uuid:${options.serverUuid}`
          : `uuid:${options.serverUuid}::${nt}`;

      const message = [
        "NOTIFY * HTTP/1.1",
        "HOST: 239.255.255.250:1900",
        "CACHE-CONTROL: max-age=1800",
        `LOCATION: ${location}`,
        `NT: ${nt}`,
        `NTS: ${nts}`,
        "SERVER: macOS/13.0 UPnP/1.0 CarusoBridge/0.2.0 DLNADOC/1.50",
        "OPT: \"http://schemas.upnp.org/upnp/1/0/\"; ns=01",
        "01-NLS: 9d6e2b72-36b3-4c86-b9dd-5b01feadf4b0",
        `USN: ${usn}`,
        "",
        ""
      ].join("\r\n");

        entry.socket.send(message, 1900, "239.255.255.250");
      }
    }
  }

  return {
    async start() {
      await Promise.all(sockets.map(async (entry) => {
        const socket = entry.socket;

        await new Promise<void>((resolve, reject) => {
          socket.once("error", reject);
          socket.bind(1900, () => {
            socket.off("error", reject);
            socket.setMulticastTTL(2);
            socket.addMembership("239.255.255.250", entry.address);
            resolve();
          });
        });

        socket.on("message", (message, remote) => {
          const text = message.toString("utf8");
          if (!text.startsWith("M-SEARCH")) {
            return;
          }

          const headers = parseHeaders(text);
          const st = headers.st;
          if (!st || (!ntsTargets.includes(st) && st !== "ssdp:all")) {
            return;
          }

          const location = `${entry.baseUrl}/upnp/device-description.xml`;
          const replies = st === "ssdp:all" ? ntsTargets : [st];
          for (const target of replies) {
            socket.send(formatSsdpResponse(location, target), remote.port, remote.address);
          }
        });
      }));

      sendNotify("ssdp:alive");
      notifyInterval = setInterval(() => {
        sendNotify("ssdp:alive");
      }, 15 * 60 * 1000);
    },

    async stop() {
      if (notifyInterval) {
        clearInterval(notifyInterval);
      }

      sendNotify("ssdp:byebye");
      await Promise.all(sockets.map((entry) => new Promise<void>((resolve) => entry.socket.close(() => resolve()))));
    }
  };
}

async function buildBrowseTree(context: BrowseContext, objectId: string): Promise<Map<string, BrowseNode>> {
  const tree = new Map<string, BrowseNode>();
  const addContainer = (container: BrowseContainer) => tree.set(container.id, container);
  const addItem = (item: BrowseItem) => tree.set(item.id, item);

  const localTrackIds = context.tracks.map((track) => `local-track:${track.id}`);
  const favoriteIds = context.favorites.map((favorite) => `tunein-favorite:${favorite.id}`);

  addContainer({
    kind: "container",
    id: "0",
    parentId: "-1",
    title: context.serverName,
    children: ["tunein", "local-music"],
    upnpClass: "object.container.storageFolder"
  });

  addContainer({
    kind: "container",
    id: "tunein",
    parentId: "0",
    title: "TuneIn",
    children: ["tunein-sender", "tunein-browse-root"],
    upnpClass: "object.container.storageFolder"
  });

  addContainer({
    kind: "container",
    id: "tunein-sender",
    parentId: "tunein",
    title: "Sender",
    children: favoriteIds,
    upnpClass: "object.container.storageFolder"
  });

  for (const favorite of context.favorites) {
    addItem({
      kind: "item",
      id: `tunein-favorite:${favorite.id}`,
      parentId: "tunein-sender",
      title: favorite.title,
      url: new URL(`/stream/tunein-favorite/${favorite.id}`, context.baseUrl).toString(),
      mimeType: favorite.mimeType || "audio/mpeg",
      upnpClass: "object.item.audioItem.audioBroadcast"
    });
  }

  addContainer({
    kind: "container",
    id: "tunein-browse-root",
    parentId: "tunein",
    title: "Browse",
    children: TUNEIN_ROOT_CATEGORIES.map((category) => createBrowseContainerId(category.url)),
    upnpClass: "object.container.storageFolder"
  });

  for (const category of TUNEIN_ROOT_CATEGORIES) {
    addContainer({
      kind: "container",
      id: createBrowseContainerId(category.url),
      parentId: "tunein-browse-root",
      title: category.title,
      children: [],
      upnpClass: "object.container.storageFolder"
    });
  }

  if (objectId.startsWith("tunein-browse:")) {
    const browseUrl = decodeBrowseContainerId(objectId);
    const items = isAllowedTuneInBrowseUrl(browseUrl)
      ? await browseDirectory(browseUrl).catch(() => []).then((entries) => entries.slice(0, MAX_TUNEIN_BROWSE_ITEMS))
      : [];
    const childIds: string[] = [];

    for (const item of items) {
      const browseTarget = item.actions?.browse || item.actions?.play;

      if (item.type === "link" && browseTarget) {
        const childId = createBrowseContainerId(browseTarget);
        addContainer({
          kind: "container",
          id: childId,
          parentId: objectId,
          title: item.text,
          children: [],
          upnpClass: "object.container.storageFolder"
        });
        childIds.push(childId);
        continue;
      }

      if (item.type === "audio" && item.actions?.play) {
        const childId = createBrowseItemId(item.actions.play);
        addItem({
          kind: "item",
          id: childId,
          parentId: objectId,
          title: item.text,
          url: new URL("/stream/tunein.mp3", context.baseUrl).toString() + `?url=${encodeURIComponent(item.actions.play)}`,
          mimeType: item.formats?.includes("aac") ? "audio/aac" : "audio/mpeg",
          upnpClass: "object.item.audioItem.audioBroadcast"
        });
        childIds.push(childId);
      }
    }

    const dynamicContainer = tree.get(objectId);
    if (dynamicContainer?.kind === "container") {
      dynamicContainer.children = childIds;
    }
  }

  addContainer({
    kind: "container",
    id: "local-music",
    parentId: "0",
    title: "Lokale Musik",
    children: localTrackIds,
    upnpClass: "object.container.storageFolder"
  });

  for (const track of context.tracks) {
    addItem({
      kind: "item",
      id: `local-track:${track.id}`,
      parentId: "local-music",
      title: track.title,
      url: track.url,
      mimeType: mimeFromTrack(track.extension),
      upnpClass: "object.item.audioItem.musicTrack"
    });
  }

  return tree;
}

function buildFallbackBrowseTree(context: BrowseContext): Map<string, BrowseNode> {
  const tree = new Map<string, BrowseNode>();
  const favoriteIds = context.favorites.map((favorite) => `tunein-favorite:${favorite.id}`);
  const localTrackIds = context.tracks.map((track) => `local-track:${track.id}`);

  tree.set("0", {
    kind: "container",
    id: "0",
    parentId: "-1",
    title: context.serverName,
    children: ["tunein", "local-music"],
    upnpClass: "object.container.storageFolder"
  });

  tree.set("tunein", {
    kind: "container",
    id: "tunein",
    parentId: "0",
    title: "TuneIn",
    children: ["tunein-sender", "tunein-browse-root"],
    upnpClass: "object.container.storageFolder"
  });

  tree.set("tunein-browse-root", {
    kind: "container",
    id: "tunein-browse-root",
    parentId: "tunein",
    title: "Browse",
    children: [],
    upnpClass: "object.container.storageFolder"
  });

  tree.set("tunein-sender", {
    kind: "container",
    id: "tunein-sender",
    parentId: "tunein",
    title: "Sender",
    children: favoriteIds,
    upnpClass: "object.container.storageFolder"
  });

  for (const favorite of context.favorites) {
    tree.set(`tunein-favorite:${favorite.id}`, {
      kind: "item",
      id: `tunein-favorite:${favorite.id}`,
      parentId: "tunein-sender",
      title: favorite.title,
      url: new URL(`/stream/tunein-favorite/${favorite.id}`, context.baseUrl).toString(),
      mimeType: favorite.mimeType || "audio/mpeg",
      upnpClass: "object.item.audioItem.audioBroadcast"
    });
  }

  tree.set("local-music", {
    kind: "container",
    id: "local-music",
    parentId: "0",
    title: "Lokale Musik",
    children: localTrackIds,
    upnpClass: "object.container.storageFolder"
  });

  for (const track of context.tracks) {
    tree.set(`local-track:${track.id}`, {
      kind: "item",
      id: `local-track:${track.id}`,
      parentId: "local-music",
      title: track.title,
      url: track.url,
      mimeType: mimeFromTrack(track.extension),
      upnpClass: "object.item.audioItem.musicTrack"
    });
  }

  return tree;
}

function serializeNode(node: BrowseNode): string {
  if (node.kind === "container") {
    return `<container id="${escapeXml(node.id)}" parentID="${escapeXml(node.parentId)}" restricted="1" searchable="0" childCount="${node.children.length}">
  <dc:title>${escapeXml(node.title)}</dc:title>
  <upnp:class>${escapeXml(node.upnpClass)}</upnp:class>
</container>`;
  }

  const protocolInfo = node.mimeType === "audio/mpeg"
    ? "http-get:*:audio/mpeg:DLNA.ORG_PN=MP3;DLNA.ORG_OP=01;DLNA.ORG_FLAGS=01700000000000000000000000000000"
    : node.mimeType === "audio/aac"
      ? "http-get:*:audio/aac:DLNA.ORG_OP=01;DLNA.ORG_FLAGS=01700000000000000000000000000000"
      : `http-get:*:${escapeXml(node.mimeType)}:*`;

  return `<item id="${escapeXml(node.id)}" parentID="${escapeXml(node.parentId)}" restricted="1">
  <dc:title>${escapeXml(node.title)}</dc:title>
  <upnp:class>${escapeXml(node.upnpClass)}</upnp:class>
  <res protocolInfo="${protocolInfo}">${escapeXml(node.url)}</res>
</item>`;
}

function wrapDidl(inner: string): string {
  return `<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">${inner}</DIDL-Lite>`;
}

function soapEnvelope(actionName: string, serviceType: string, values: Record<string, string>): string {
  const body = Object.entries(values)
    .map(([key, value]) => `<${key}>${escapeXml(value)}</${key}>`)
    .join("");

  return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <${actionName} xmlns:u="${serviceType}">
      ${body}
    </${actionName}>
  </s:Body>
</s:Envelope>`;
}

function parseHeaders(message: string): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const line of message.split("\r\n")) {
    const separator = line.indexOf(":");
    if (separator === -1) {
      continue;
    }

    headers[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
  }

  return headers;
}

function getAny(source: Record<string, unknown> | undefined, keys: string[]): unknown {
  if (!source) {
    return undefined;
  }

  for (const key of keys) {
    if (key in source) {
      return source[key];
    }
  }

  return undefined;
}

function escapeXml(value: string, escapeRawXml = true): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", escapeRawXml ? "&lt;" : "<")
    .replaceAll(">", escapeRawXml ? "&gt;" : ">")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function mimeFromTrack(extension: string): string {
  switch (extension) {
    case ".mp3":
      return "audio/mpeg";
    case ".flac":
      return "audio/flac";
    case ".aac":
    case ".m4a":
      return "audio/aac";
    case ".ogg":
    case ".opus":
      return "audio/ogg";
    case ".wav":
      return "audio/wav";
    default:
      return "application/octet-stream";
  }
}

function createBrowseContainerId(url: string): string {
  return `tunein-browse:${Buffer.from(url).toString("base64url")}`;
}

function decodeBrowseContainerId(id: string): string {
  return Buffer.from(id.replace("tunein-browse:", ""), "base64url").toString("utf8");
}

function createBrowseItemId(url: string): string {
  return `tunein-item:${Buffer.from(url).toString("base64url")}`;
}
