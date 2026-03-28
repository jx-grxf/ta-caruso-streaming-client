import { XMLParser } from "fast-xml-parser";
import { fetch } from "undici";

export type UpnpService = {
  serviceType: string;
  serviceId?: string;
  SCPDURL?: string;
  controlURL: string;
  eventSubURL?: string;
};

export type UpnpDeviceDescription = {
  url: string;
  friendlyName?: string;
  deviceType?: string;
  manufacturer?: string;
  modelName?: string;
  services: UpnpService[];
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: ""
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

export async function fetchDeviceDescription(url: string): Promise<UpnpDeviceDescription> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load UPnP description: ${response.status}`);
  }

  const xml = await response.text();
  const parsed = parser.parse(xml) as {
    root?: {
      device?: {
        friendlyName?: string;
        deviceType?: string;
        manufacturer?: string;
        modelName?: string;
        serviceList?: {
          service?: Record<string, string> | Array<Record<string, string>>;
        };
      };
    };
  };

  const device = parsed.root?.device;

  return {
    url,
    friendlyName: device?.friendlyName,
    deviceType: device?.deviceType,
    manufacturer: device?.manufacturer,
    modelName: device?.modelName,
    services: asArray(device?.serviceList?.service).map((service) => ({
      serviceType: service.serviceType,
      serviceId: service.serviceId,
      SCPDURL: service.SCPDURL,
      controlURL: service.controlURL,
      eventSubURL: service.eventSubURL
    }))
  };
}
