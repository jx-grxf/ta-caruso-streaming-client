import { config } from "./config.js";
import { createApp } from "./app.js";
import { createSsdpServer } from "./upnp/media-server.js";

export type ServerManagerOptions = {
  dataDir: string;
};

export function createServerManager(options: ServerManagerOptions) {
  let runtime:
    | {
        close: () => Promise<void>;
        url: string;
        startedAt: string;
      }
    | undefined;

  return {
    async start() {
      if (runtime) {
        return runtime;
      }

      const built = await createApp(options.dataDir);
      const persistedConfig = await built.context.storage.getConfig();
      const resolvedPublicBaseUrl = persistedConfig.publicBaseUrl || config.publicBaseUrl;
      const ssdp = createSsdpServer({
        locations: config.networkAddresses.length > 0
          ? config.networkAddresses.map((address) => ({
              address,
              baseUrl: `http://${address}:${config.port}`
            }))
          : [{
              address: new URL(resolvedPublicBaseUrl).hostname,
              baseUrl: resolvedPublicBaseUrl
            }],
        serverUuid: built.context.upnp.serverUuid,
        friendlyName: built.context.upnp.friendlyName
      });
      await built.app.listen({
        host: config.host,
        port: config.port
      });
      await ssdp.start();

      runtime = {
        close: async () => {
          await ssdp.stop();
          await built.app.close();
        },
        url: resolvedPublicBaseUrl,
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

    getState() {
      return {
        running: Boolean(runtime),
        url: runtime?.url ?? config.publicBaseUrl,
        startedAt: runtime?.startedAt
      };
    }
  };
}
