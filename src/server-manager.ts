import { config, detectExternalIPv4Addresses, resolveActivePublicBaseUrl } from "./config.js";
import { createApp } from "./app.js";
import { createSsdpServer } from "./upnp/media-server.js";

export type ServerManagerOptions = {
  dataDir: string;
  loggerEnabled?: boolean;
};

export function createServerManager(options: ServerManagerOptions) {
  let runtime:
    | {
        close: () => Promise<void>;
        refreshNetworkBindings: () => Promise<void>;
        url: string;
        startedAt: string;
      }
    | undefined;

  return {
    async start() {
      if (runtime) {
        return runtime;
      }

      const built = await createApp(options.dataDir, {
        loggerEnabled: options.loggerEnabled
      });
      let ssdp = await createCurrentSsdpServer(built.context.storage, built.context.upnp.serverUuid);
      let networkSignature = getNetworkSignature();
      let refreshInFlight: Promise<void> | undefined;
      let monitorInterval: NodeJS.Timeout | undefined;

      await built.app.listen({
        host: config.host,
        port: config.port
      });
      await ssdp.start();

      const refreshNetworkBindings = async () => {
        if (refreshInFlight) {
          return refreshInFlight;
        }

        refreshInFlight = (async () => {
          const nextSignature = getNetworkSignature();
          if (nextSignature === networkSignature) {
            return;
          }

          const nextSsdp = await createCurrentSsdpServer(built.context.storage, built.context.upnp.serverUuid);
          await ssdp.stop();
          ssdp = nextSsdp;
          await ssdp.start();
          networkSignature = nextSignature;
          runtime = runtime
            ? {
                ...runtime,
                url: resolveActivePublicBaseUrl((await built.context.storage.getConfig()).publicBaseUrl, config.port)
              }
            : runtime;
        })();

        try {
          await refreshInFlight;
        } finally {
          refreshInFlight = undefined;
        }
      };

      monitorInterval = setInterval(() => {
        void refreshNetworkBindings();
      }, 5000);

      runtime = {
        close: async () => {
          if (monitorInterval) {
            clearInterval(monitorInterval);
          }
          await ssdp.stop();
          await built.app.close();
        },
        refreshNetworkBindings,
        url: resolveActivePublicBaseUrl((await built.context.storage.getConfig()).publicBaseUrl, config.port),
        startedAt: built.context.startedAt
      };

      return runtime;
    },

    async stop() {
      if (!runtime) {
        return;
      }

      await runtime.close();
      runtime = undefined;
    },

    async refreshNetworkBindings() {
      await runtime?.refreshNetworkBindings();
      return this.getState();
    },

    getState() {
      return {
        running: Boolean(runtime),
        url: runtime?.url ?? resolveActivePublicBaseUrl(undefined, config.port),
        startedAt: runtime?.startedAt
      };
    }
  };
}

function getNetworkSignature(): string {
  return detectExternalIPv4Addresses().join("|");
}

async function createCurrentSsdpServer(
  storage: Awaited<ReturnType<typeof createApp>>["context"]["storage"],
  serverUuid: string
) {
  const persistedConfig = await storage.getConfig();
  const resolvedPublicBaseUrl = resolveActivePublicBaseUrl(persistedConfig.publicBaseUrl, config.port);
  const addresses = detectExternalIPv4Addresses();
  const friendlyName = `${persistedConfig.carusoFriendlyName || config.carusoFriendlyName || "Caruso"} auf ${process.env.HOSTNAME || "MacBook"}`;

  return createSsdpServer({
    locations: addresses.length > 0
      ? addresses.map((address) => ({
          address,
          baseUrl: `http://${address}:${config.port}`
        }))
      : [{
          address: new URL(resolvedPublicBaseUrl).hostname,
          baseUrl: resolvedPublicBaseUrl
        }],
    serverUuid,
    friendlyName
  });
}
