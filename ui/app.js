const translations = {
  de: {
    eyebrow: "T+A Caruso Streaming Bridge",
    heroTitle: "Schwarze Zentrale fuer TuneIn, lokale Musik und deinen Caruso.",
    heroLead: "Sender suchen, als Favorit in die browsbare Senderliste legen und live sehen, was dein Caruso gerade macht.",
    refresh: "Neu laden",
    openBrowser: "Im Browser",
    nowPlaying: "Live Status",
    selectedRenderer: "Ausgewaehlter Renderer",
    transport: "Transport",
    currentSource: "Aktuelle Quelle",
    quality: "Qualitaet",
    position: "Position",
    publicUrl: "Public URL",
    serverConfig: "Server & Konfiguration",
    startServer: "Server starten",
    stopServer: "Server stoppen",
    carusoFilter: "Caruso Filter",
    deezerArl: "Deezer ARL",
    saveConfig: "Konfiguration speichern",
    favoritesTitle: "Senderliste fuer den Caruso",
    favoritesLead: "Alles hier erscheint im browsbaren UPnP-Menue unter TuneIn > Sender.",
    rendererTitle: "Caruso / Renderer",
    rediscover: "UPnP neu suchen",
    tuneinTitle: "TuneIn Suche",
    search: "Suchen",
    localMusicTitle: "Lokale Musik",
    chooseFolder: "Ordner waehlen",
    addFolder: "Ordner hinzufuegen",
    emptyRenderers: "Noch kein Renderer gefunden.",
    emptyTuneIn: "Noch keine TuneIn-Ergebnisse.",
    emptyFavorites: "Noch keine Sender auf der Caruso-Senderliste.",
    emptyFolders: "Noch kein Musikordner hinterlegt.",
    emptyTracks: "Noch keine lokalen Audiodateien gefunden.",
    select: "Auswaehlen",
    selected: "Ausgewaehlt",
    playOnCaruso: "Auf Caruso spielen",
    addToList: "Zur Senderliste",
    remove: "Entfernen",
    play: "Spielen",
    unknown: "Unbekannt",
    rendererNeeded: "Bitte zuerst einen Renderer auswaehlen.",
    folderNeeded: "Bitte einen Musikordner angeben.",
    searchNeeded: "Bitte einen Suchbegriff eingeben.",
    folderAdded: "Musikordner hinzugefuegt.",
    configSaved: "Konfiguration gespeichert.",
    favoritesSaved: "Sender zur Caruso-Senderliste hinzugefuegt.",
    favoriteRemoved: "Sender entfernt.",
    rediscovered: "UPnP-Suche abgeschlossen.",
    tuneinSent: "TuneIn-Stream an den Caruso gesendet.",
    localSent: "Lokalen Track an den Caruso gesendet.",
    startDesktopOnly: "Starten ist nur in der Desktop-App verfuegbar.",
    stopDesktopOnly: "Stoppen ist nur in der Desktop-App verfuegbar.",
    chooseDesktopOnly: "Ordnerwahl ist nur in der Desktop-App verfuegbar."
  },
  en: {
    eyebrow: "T+A Caruso Streaming Bridge",
    heroTitle: "Dark control room for TuneIn, local music and your Caruso.",
    heroLead: "Search stations, pin them into a browsable station list and watch your Caruso status live.",
    refresh: "Refresh",
    openBrowser: "Open in browser",
    nowPlaying: "Live Status",
    selectedRenderer: "Selected Renderer",
    transport: "Transport",
    currentSource: "Current Source",
    quality: "Quality",
    position: "Position",
    publicUrl: "Public URL",
    serverConfig: "Server & Configuration",
    startServer: "Start server",
    stopServer: "Stop server",
    carusoFilter: "Caruso filter",
    deezerArl: "Deezer ARL",
    saveConfig: "Save configuration",
    favoritesTitle: "Station list for Caruso",
    favoritesLead: "Everything here appears in the browsable UPnP menu under TuneIn > Sender.",
    rendererTitle: "Caruso / Renderer",
    rediscover: "Rediscover UPnP",
    tuneinTitle: "TuneIn Search",
    search: "Search",
    localMusicTitle: "Local Music",
    chooseFolder: "Choose folder",
    addFolder: "Add folder",
    emptyRenderers: "No renderer found yet.",
    emptyTuneIn: "No TuneIn results yet.",
    emptyFavorites: "No stations on the Caruso station list yet.",
    emptyFolders: "No music folder configured yet.",
    emptyTracks: "No local audio files found yet.",
    select: "Select",
    selected: "Selected",
    playOnCaruso: "Play on Caruso",
    addToList: "Add to list",
    remove: "Remove",
    play: "Play",
    unknown: "Unknown",
    rendererNeeded: "Please select a renderer first.",
    folderNeeded: "Please enter a music folder.",
    searchNeeded: "Please enter a search term.",
    folderAdded: "Music folder added.",
    configSaved: "Configuration saved.",
    favoritesSaved: "Station added to the Caruso list.",
    favoriteRemoved: "Station removed.",
    rediscovered: "UPnP discovery finished.",
    tuneinSent: "TuneIn stream sent to the Caruso.",
    localSent: "Local track sent to the Caruso.",
    startDesktopOnly: "Starting is only available in the desktop app.",
    stopDesktopOnly: "Stopping is only available in the desktop app.",
    chooseDesktopOnly: "Folder chooser is only available in the desktop app."
  }
};

const state = {
  language: "de",
  devices: [],
  selectedDeviceUrl: null,
  selectedDeviceName: null,
  tracks: [],
  folders: [],
  tuneinItems: [],
  favorites: [],
  rendererStatus: null
};

const elements = Object.fromEntries(
  [
    "refreshButton", "openBrowserButton", "languageSelect", "serverBadge", "statusSummary", "startServerButton", "stopServerButton",
    "configForm", "publicBaseUrlInput", "carusoNameInput", "deezerArlInput", "discoverButton", "deviceList", "tuneinQueryInput",
    "tuneinSearchButton", "tuneinResults", "favoriteStations", "folderInput", "chooseFolderButton", "addFolderButton", "libraryFolders",
    "localTracks", "toast", "selectedRendererLabel", "transportStateLabel", "currentTitleLabel", "qualityLabel", "positionLabel", "publicUrlLabel"
  ].map((id) => [id, document.querySelector(`#${id}`)])
);

function t(key) {
  return translations[state.language][key] || key;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.remove("hidden");
  clearTimeout(showToast.timeoutId);
  showToast.timeoutId = setTimeout(() => elements.toast.classList.add("hidden"), 2800);
}

async function api(path, options) {
  const response = await fetch(path, {
    headers: {
      "content-type": "application/json"
    },
    ...options
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

function applyTranslations() {
  document.documentElement.lang = state.language;
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.getAttribute("data-i18n"));
  });
}

function ensureRendererSelection() {
  if (!state.selectedDeviceUrl && state.devices[0]?.location) {
    state.selectedDeviceUrl = state.devices[0].location;
    state.selectedDeviceName = state.devices[0].description?.friendlyName || state.devices[0].location;
  }
}

function renderStatus(status, desktopState) {
  elements.serverBadge.textContent = desktopState?.running === false ? "Offline" : "Live";
  elements.publicUrlLabel.textContent = status.server.publicBaseUrl;
  elements.statusSummary.innerHTML = `
    <dt>${t("publicUrl")}</dt><dd>${status.server.publicBaseUrl}</dd>
    <dt>Tracks</dt><dd>${status.library.trackCount}</dd>
    <dt>Folders</dt><dd>${status.library.folders.length}</dd>
    <dt>Deezer</dt><dd>${status.deezer.warning}</dd>
  `;
  elements.publicBaseUrlInput.value = status.config.publicBaseUrl || "";
  elements.carusoNameInput.value = status.config.carusoFriendlyName || "";
  elements.deezerArlInput.value = status.config.deezerArl || "";
  state.language = status.config.uiLanguage || state.language;
  elements.languageSelect.value = state.language;
  state.folders = status.library.folders;
  state.favorites = status.tunein.favorites;
  applyTranslations();
  renderFolders();
  renderFavorites();
}

function renderRendererStatus() {
  elements.selectedRendererLabel.textContent = state.selectedDeviceName || "-";
  elements.transportStateLabel.textContent = state.rendererStatus?.transportState || "-";
  elements.currentTitleLabel.textContent = state.rendererStatus?.title || t("unknown");
  elements.qualityLabel.textContent = state.rendererStatus?.quality || "-";
  elements.positionLabel.textContent = state.rendererStatus?.relativeTimePosition || "-";
}

function renderDevices() {
  ensureRendererSelection();

  if (state.devices.length === 0) {
    elements.deviceList.innerHTML = `<div class="empty">${t("emptyRenderers")}</div>`;
    return;
  }

  elements.deviceList.innerHTML = state.devices.map((device) => {
    const name = device.description?.friendlyName || device.location || device.address;
    const selected = state.selectedDeviceUrl === device.location;
    return `
      <div class="item">
        <div class="item-row">
          <div>
            <strong>${name}</strong>
            <div class="meta">${device.description?.modelName || t("unknown")} · ${device.address}</div>
          </div>
          <button class="button ${selected ? "button-secondary" : "button-ghost"}" data-select-device="${device.location || ""}" data-select-name="${name}">
            ${selected ? t("selected") : t("select")}
          </button>
        </div>
      </div>
    `;
  }).join("");
}

function renderTuneIn() {
  if (state.tuneinItems.length === 0) {
    elements.tuneinResults.innerHTML = `<div class="empty">${t("emptyTuneIn")}</div>`;
    return;
  }

  elements.tuneinResults.innerHTML = state.tuneinItems.map((item) => `
    <div class="item">
      <div class="item-row">
        <div>
          <strong>${item.text}</strong>
          <div class="meta">${item.subtext || item.type}${item.bitrate ? ` · ${item.bitrate} kbps` : ""}</div>
        </div>
        <div class="item-actions">
          <button class="button button-secondary" data-add-favorite="${encodeURIComponent(JSON.stringify({
            id: item.guideId || item.text.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
            title: item.text,
            streamUrl: item.actions?.play,
            subtitle: item.subtext,
            image: item.image,
            bitrate: item.bitrate,
            mimeType: item.formats?.includes("aac") ? "audio/aac" : "audio/mpeg"
          }))}">${t("addToList")}</button>
          <button class="button" data-play-tunein="${item.actions?.play || ""}">${t("playOnCaruso")}</button>
        </div>
      </div>
    </div>
  `).join("");
}

function renderFavorites() {
  if (state.favorites.length === 0) {
    elements.favoriteStations.innerHTML = `<div class="empty">${t("emptyFavorites")}</div>`;
    return;
  }

  elements.favoriteStations.innerHTML = state.favorites.map((item) => `
    <div class="item">
      <div class="item-row">
        <div>
          <strong>${item.title}</strong>
          <div class="meta">${item.subtitle || "TuneIn"}${item.bitrate ? ` · ${item.bitrate} kbps` : ""}</div>
        </div>
        <div class="item-actions">
          <button class="button" data-play-favorite="${item.streamUrl}">${t("playOnCaruso")}</button>
          <button class="button button-ghost" data-remove-favorite="${item.id}">${t("remove")}</button>
        </div>
      </div>
    </div>
  `).join("");
}

function renderFolders() {
  if (state.folders.length === 0) {
    elements.libraryFolders.innerHTML = `<div class="empty">${t("emptyFolders")}</div>`;
    return;
  }

  elements.libraryFolders.innerHTML = state.folders.map((folder) => `
    <div class="item">
      <div class="item-row">
        <span>${folder}</span>
        <button class="button button-ghost" data-remove-folder="${folder}">${t("remove")}</button>
      </div>
    </div>
  `).join("");
}

function renderTracks() {
  if (state.tracks.length === 0) {
    elements.localTracks.innerHTML = `<div class="empty">${t("emptyTracks")}</div>`;
    return;
  }

  elements.localTracks.innerHTML = state.tracks.slice(0, 150).map((track) => `
    <div class="item">
      <div class="item-row">
        <div>
          <strong>${track.title}</strong>
          <div class="meta">${track.relativePath}</div>
        </div>
        <button class="button" data-play-local="${track.id}">${t("play")}</button>
      </div>
    </div>
  `).join("");
}

async function refreshStatus() {
  const [status, desktopState] = await Promise.all([
    api("/api/status"),
    window.desktopControls?.getServerState?.() || Promise.resolve(null)
  ]);
  renderStatus(status, desktopState);
  renderRendererStatus();
}

async function refreshDevices() {
  const result = await api("/api/discover");
  state.devices = result.devices;
  renderDevices();
  await refreshRendererStatus();
}

async function refreshTracks() {
  const result = await api("/api/library/tracks");
  state.tracks = result.items;
  renderTracks();
}

async function refreshRendererStatus() {
  if (!state.selectedDeviceUrl) {
    state.rendererStatus = null;
    renderRendererStatus();
    return;
  }

  try {
    const result = await api(`/api/renderer/status?deviceDescriptionUrl=${encodeURIComponent(state.selectedDeviceUrl)}`);
    state.rendererStatus = result.status;
  } catch {
    state.rendererStatus = null;
  }

  renderRendererStatus();
}

async function runTuneInSearch() {
  const query = elements.tuneinQueryInput.value.trim();
  if (!query) {
    showToast(t("searchNeeded"));
    return;
  }

  const result = await api(`/api/tunein/search?q=${encodeURIComponent(query)}`);
  state.tuneinItems = result.items.filter((item) => item.actions?.play);
  renderTuneIn();
}

async function addFavorite(favorite) {
  await api("/api/tunein/favorites", {
    method: "POST",
    body: JSON.stringify(favorite)
  });
  const result = await api("/api/tunein/favorites");
  state.favorites = result.items;
  renderFavorites();
  showToast(t("favoritesSaved"));
}

async function playTuneIn(streamUrl) {
  if (!state.selectedDeviceUrl) {
    showToast(t("rendererNeeded"));
    return;
  }

  await api("/api/caruso/play/tunein", {
    method: "POST",
    body: JSON.stringify({
      deviceDescriptionUrl: state.selectedDeviceUrl,
      streamUrl,
      title: state.tuneinItems.find((item) => item.actions?.play === streamUrl)?.text || state.favorites.find((item) => item.streamUrl === streamUrl)?.title || "TuneIn Stream"
    })
  });

  await refreshRendererStatus();
  showToast(t("tuneinSent"));
}

async function playLocal(trackId) {
  if (!state.selectedDeviceUrl) {
    showToast(t("rendererNeeded"));
    return;
  }

  await api("/api/caruso/play/local", {
    method: "POST",
    body: JSON.stringify({
      deviceDescriptionUrl: state.selectedDeviceUrl,
      trackId
    })
  });

  await refreshRendererStatus();
  showToast(t("localSent"));
}

async function addFolder(folderPath) {
  await api("/api/library/folders", {
    method: "POST",
    body: JSON.stringify({ path: folderPath })
  });
  elements.folderInput.value = "";
  await refreshStatus();
  await refreshTracks();
  showToast(t("folderAdded"));
}

elements.refreshButton.addEventListener("click", async () => {
  await Promise.all([refreshStatus(), refreshDevices(), refreshTracks()]);
});

elements.openBrowserButton.addEventListener("click", async () => {
  if (window.desktopControls?.openBrowser) {
    await window.desktopControls.openBrowser();
    return;
  }
  window.open("/", "_blank");
});

elements.languageSelect.addEventListener("change", async () => {
  state.language = elements.languageSelect.value === "en" ? "en" : "de";
  applyTranslations();
  renderDevices();
  renderTuneIn();
  renderFavorites();
  renderFolders();
  renderTracks();
  renderRendererStatus();
  await api("/api/config", {
    method: "PUT",
    body: JSON.stringify({
      publicBaseUrl: elements.publicBaseUrlInput.value,
      carusoFriendlyName: elements.carusoNameInput.value,
      deezerArl: elements.deezerArlInput.value,
      uiLanguage: state.language
    })
  });
});

elements.startServerButton.addEventListener("click", async () => {
  if (!window.desktopControls?.startServer) {
    showToast(t("startDesktopOnly"));
    return;
  }
  await window.desktopControls.startServer();
  await refreshStatus();
});

elements.stopServerButton.addEventListener("click", async () => {
  if (!window.desktopControls?.stopServer) {
    showToast(t("stopDesktopOnly"));
    return;
  }
  await window.desktopControls.stopServer();
  await refreshStatus();
});

elements.configForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await api("/api/config", {
    method: "PUT",
    body: JSON.stringify({
      publicBaseUrl: elements.publicBaseUrlInput.value,
      carusoFriendlyName: elements.carusoNameInput.value,
      deezerArl: elements.deezerArlInput.value,
      uiLanguage: state.language
    })
  });
  showToast(t("configSaved"));
  await refreshStatus();
});

elements.discoverButton.addEventListener("click", async () => {
  await refreshDevices();
  showToast(t("rediscovered"));
});

elements.tuneinSearchButton.addEventListener("click", async () => {
  await runTuneInSearch();
});

elements.addFolderButton.addEventListener("click", async () => {
  const folderPath = elements.folderInput.value.trim();
  if (!folderPath) {
    showToast(t("folderNeeded"));
    return;
  }
  await addFolder(folderPath);
});

elements.chooseFolderButton.addEventListener("click", async () => {
  if (!window.desktopControls?.chooseFolder) {
    showToast(t("chooseDesktopOnly"));
    return;
  }
  const folderPath = await window.desktopControls.chooseFolder();
  if (folderPath) {
    elements.folderInput.value = folderPath;
  }
});

document.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const selectDevice = target.getAttribute("data-select-device");
  if (selectDevice) {
    state.selectedDeviceUrl = selectDevice;
    state.selectedDeviceName = target.getAttribute("data-select-name");
    renderDevices();
    await refreshRendererStatus();
    return;
  }

  const playTuneInUrl = target.getAttribute("data-play-tunein");
  if (playTuneInUrl) {
    await playTuneIn(playTuneInUrl);
    return;
  }

  const playFavoriteUrl = target.getAttribute("data-play-favorite");
  if (playFavoriteUrl) {
    await playTuneIn(playFavoriteUrl);
    return;
  }

  const favoritePayload = target.getAttribute("data-add-favorite");
  if (favoritePayload) {
    await addFavorite(JSON.parse(decodeURIComponent(favoritePayload)));
    return;
  }

  const removeFavorite = target.getAttribute("data-remove-favorite");
  if (removeFavorite) {
    const result = await api(`/api/tunein/favorites/${encodeURIComponent(removeFavorite)}`, { method: "DELETE" });
    state.favorites = result.items;
    renderFavorites();
    showToast(t("favoriteRemoved"));
    return;
  }

  const playLocalId = target.getAttribute("data-play-local");
  if (playLocalId) {
    await playLocal(playLocalId);
    return;
  }

  const removeFolder = target.getAttribute("data-remove-folder");
  if (removeFolder) {
    await api(`/api/library/folders?path=${encodeURIComponent(removeFolder)}`, { method: "DELETE" });
    await refreshStatus();
    await refreshTracks();
  }
});

await Promise.all([refreshStatus(), refreshDevices(), refreshTracks()]);
setInterval(() => {
  void refreshRendererStatus();
}, 5000);
