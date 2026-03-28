import { XMLParser } from "fast-xml-parser";
import { fetch } from "undici";
import { fetchDeviceDescription } from "./device-description.js";

type SoapActionOptions = {
  deviceDescriptionUrl: string;
  serviceType: string;
  actionName: string;
  body: string;
};

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: ""
});

async function sendSoapAction(options: SoapActionOptions): Promise<string> {
  const description = await fetchDeviceDescription(options.deviceDescriptionUrl);
  const service = description.services.find((item) => item.serviceType.includes(options.serviceType));

  if (!service) {
    throw new Error(`Service ${options.serviceType} not found on device ${description.friendlyName ?? options.deviceDescriptionUrl}.`);
  }

  const controlUrl = new URL(service.controlURL, options.deviceDescriptionUrl).toString();
  const envelope = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:${options.actionName} xmlns:u="${service.serviceType}">
      ${options.body}
    </u:${options.actionName}>
  </s:Body>
</s:Envelope>`;

  const response = await fetch(controlUrl, {
    method: "POST",
    headers: {
      "content-type": 'text/xml; charset="utf-8"',
      soapaction: `"${service.serviceType}#${options.actionName}"`
    },
    body: envelope
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SOAP ${options.actionName} failed (${response.status}): ${errorText}`);
  }

  return response.text();
}

export async function setAvTransportUri(deviceDescriptionUrl: string, currentUri: string, metadata = ""): Promise<void> {
  await sendSoapAction({
    deviceDescriptionUrl,
    serviceType: "AVTransport",
    actionName: "SetAVTransportURI",
    body: [
      "<InstanceID>0</InstanceID>",
      `<CurrentURI>${xmlEscape(currentUri)}</CurrentURI>`,
      `<CurrentURIMetaData>${xmlEscape(metadata)}</CurrentURIMetaData>`
    ].join("")
  });
}

export async function play(deviceDescriptionUrl: string): Promise<void> {
  await sendSoapAction({
    deviceDescriptionUrl,
    serviceType: "AVTransport",
    actionName: "Play",
    body: [
      "<InstanceID>0</InstanceID>",
      "<Speed>1</Speed>"
    ].join("")
  });
}

export type RendererStatus = {
  transportState?: string;
  currentUri?: string;
  currentTrackUri?: string;
  mediaDuration?: string;
  relativeTimePosition?: string;
};

function findSoapValue(xml: string, key: string): string | undefined {
  const parsed = parser.parse(xml) as Record<string, unknown>;
  const envelope = (parsed["s:Envelope"] ?? parsed.Envelope) as Record<string, unknown> | undefined;
  const body = (envelope?.["s:Body"] ?? envelope?.Body ?? parsed["s:Body"] ?? parsed.Body) as Record<string, unknown> | undefined;
  const actionBody = body ? Object.values(body)[0] as Record<string, unknown> | undefined : undefined;

  if (!actionBody) {
    return undefined;
  }

  const value = actionBody[key];
  return value == null ? undefined : String(value);
}

export async function getRendererStatus(deviceDescriptionUrl: string): Promise<RendererStatus> {
  const [transportInfoXml, mediaInfoXml, positionInfoXml] = await Promise.all([
    sendSoapAction({
      deviceDescriptionUrl,
      serviceType: "AVTransport",
      actionName: "GetTransportInfo",
      body: "<InstanceID>0</InstanceID>"
    }),
    sendSoapAction({
      deviceDescriptionUrl,
      serviceType: "AVTransport",
      actionName: "GetMediaInfo",
      body: "<InstanceID>0</InstanceID>"
    }),
    sendSoapAction({
      deviceDescriptionUrl,
      serviceType: "AVTransport",
      actionName: "GetPositionInfo",
      body: "<InstanceID>0</InstanceID>"
    })
  ]);

  return {
    transportState: findSoapValue(transportInfoXml, "CurrentTransportState"),
    currentUri: findSoapValue(mediaInfoXml, "CurrentURI"),
    currentTrackUri: findSoapValue(positionInfoXml, "TrackURI"),
    mediaDuration: findSoapValue(mediaInfoXml, "MediaDuration"),
    relativeTimePosition: findSoapValue(positionInfoXml, "RelTime")
  };
}
