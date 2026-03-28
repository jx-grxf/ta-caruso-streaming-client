export type DeezerCapabilities = {
  configured: boolean;
  mode: "unconfigured" | "arl";
  warning: string;
};

export function getDeezerCapabilities(arl?: string): DeezerCapabilities {
  if (!arl) {
    return {
      configured: false,
      mode: "unconfigured",
      warning: "DEEZER_ARL fehlt. Deezer ist noch nicht aktiviert."
    };
  }

  return {
    configured: true,
    mode: "arl",
    warning: "ARL-basierte Deezer-Anbindung ist inoffiziell und muss separat validiert werden."
  };
}
