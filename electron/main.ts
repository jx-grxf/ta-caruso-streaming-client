import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, shell, type MenuItemConstructorOptions } from "electron";
import { autoUpdater } from "electron-updater";
import { config } from "../src/config.js";
import { createServerManager } from "../src/server-manager.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const preloadPath = path.resolve(currentDir, "../../electron/preload.cjs");
const dataDir = path.join(app.getPath("userData"), "data");
const serverManager = createServerManager({ dataDir });
const desktopUiOrigin = `http://127.0.0.1:${config.port}`;
const appLabel = "Caruso Reborn";
const isMac = process.platform === "darwin";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let pendingManualUpdateCheck = false;
let latestAvailableVersion: string | null = null;

function getTrayIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
      <rect x="2" y="2" width="16" height="16" rx="4" fill="#1f2937"/>
      <path d="M6 13.5V6.5h2.2c2.5 0 4.1 1.2 4.1 3.5S10.7 13.5 8.2 13.5H6zm2-1.7h.2c1.4 0 2.1-.5 2.1-1.8 0-1.4-.7-1.8-2.1-1.8H8v3.6z" fill="#f59e0b"/>
    </svg>
  `;

  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
}

async function ensureServerRunning() {
  await serverManager.start();
}

function getServerUrl() {
  return serverManager.getState().url;
}

function buildDesktopUiUrl(section?: string) {
  return `${desktopUiOrigin}${section ? `#${section}` : ""}`;
}

function getLaunchAtLoginEnabled() {
  if (process.platform !== "darwin" && process.platform !== "win32") {
    return false;
  }

  return app.getLoginItemSettings().openAtLogin;
}

function setLaunchAtLogin(enabled: boolean) {
  if (process.platform !== "darwin" && process.platform !== "win32") {
    return;
  }

  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true
  });
}

function updatesSupported() {
  return app.isPackaged;
}

function configureAutoUpdates() {
  if (!updatesSupported()) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", async (info) => {
    latestAvailableVersion = info.version;
    rebuildTray();
    rebuildApplicationMenu();

    if (pendingManualUpdateCheck) {
      pendingManualUpdateCheck = false;
      await dialog.showMessageBox({
        type: "info",
        title: "Update wird geladen",
        message: `Caruso Reborn ${info.version} wird heruntergeladen.`,
        detail: "Sobald das Update fertig ist, kannst du die App direkt neu starten."
      });
    }
  });

  autoUpdater.on("update-not-available", async () => {
    latestAvailableVersion = null;
    rebuildTray();
    rebuildApplicationMenu();

    if (pendingManualUpdateCheck) {
      pendingManualUpdateCheck = false;
      await dialog.showMessageBox({
        type: "info",
        title: "Kein Update gefunden",
        message: `Du nutzt bereits die aktuelle Version (${app.getVersion()}).`
      });
    }
  });

  autoUpdater.on("update-downloaded", async (info) => {
    latestAvailableVersion = info.version;
    rebuildTray();
    rebuildApplicationMenu();

    const result = await dialog.showMessageBox({
      type: "info",
      buttons: ["Jetzt neu starten", "Spaeter"],
      defaultId: 0,
      cancelId: 1,
      title: "Update bereit",
      message: `Caruso Reborn ${info.version} wurde heruntergeladen.`,
      detail: "Starte die App neu, um das Update zu installieren."
    });

    if (result.response === 0) {
      isQuitting = true;
      autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.on("error", async (error) => {
    if (!pendingManualUpdateCheck) {
      return;
    }

    pendingManualUpdateCheck = false;
    await dialog.showErrorBox(
      "Update-Pruefung fehlgeschlagen",
      error instanceof Error ? error.message : "Unbekannter Fehler bei der Update-Pruefung."
    );
  });
}

async function checkForUpdates(manual = false) {
  if (!updatesSupported()) {
    if (manual) {
      await dialog.showMessageBox({
        type: "info",
        title: "Updates nur in Release-Builds",
        message: "Die Update-Pruefung ist nur in gebauten App-Releases verfuegbar."
      });
    }
    return;
  }

  pendingManualUpdateCheck = manual;
  await autoUpdater.checkForUpdates();
}

async function createMainWindow(section?: string) {
  await ensureServerRunning();

  if (mainWindow) {
    const nextUrl = buildDesktopUiUrl(section);
    if (mainWindow.webContents.getURL() !== nextUrl) {
      await mainWindow.loadURL(nextUrl);
    }
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 1220,
    height: 860,
    minWidth: 980,
    minHeight: 720,
    show: false,
    title: appLabel,
    titleBarStyle: isMac ? "hiddenInset" : "default",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  mainWindow.on("close", (event) => {
    if (isQuitting) {
      return;
    }

    event.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(buildDesktopUiUrl(section));
  return mainWindow;
}

function rebuildTray() {
  if (!tray) {
    tray = new Tray(getTrayIcon());
    tray.on("click", () => {
      void createMainWindow("dashboard");
    });
    tray.on("double-click", () => {
      void createMainWindow("dashboard");
    });
  }

  const state = serverManager.getState();
  const launchAtLoginEnabled = getLaunchAtLoginEnabled();
  const menu = Menu.buildFromTemplate([
    {
      label: state.running ? "Server aktiv" : "Server gestoppt",
      enabled: false
    },
    {
      label: state.url,
      enabled: false
    },
    { type: "separator" },
    {
      label: "Dashboard oeffnen",
      click: () => {
        void createMainWindow("dashboard");
      }
    },
    {
      label: "Einstellungen oeffnen",
      click: () => {
        void createMainWindow("settings");
      }
    },
    {
      label: state.running ? "Server stoppen" : "Server starten",
      click: async () => {
        if (state.running) {
          await serverManager.stop();
        } else {
          await serverManager.start();
        }

        if (mainWindow && !mainWindow.isDestroyed()) {
          if (serverManager.getState().running) {
            await mainWindow.loadURL(buildDesktopUiUrl("dashboard"));
          }
        }

        rebuildTray();
        rebuildApplicationMenu();
      }
    },
    {
      label: "Im Browser oeffnen",
      click: async () => {
        await ensureServerRunning();
        await shell.openExternal(getServerUrl());
      }
    },
    {
      label: "Beim Login starten",
      type: "checkbox",
      checked: launchAtLoginEnabled,
      click: () => {
        setLaunchAtLogin(!launchAtLoginEnabled);
        rebuildTray();
      }
    },
    {
      label: latestAvailableVersion
        ? `Update ${latestAvailableVersion} bereit`
        : "Nach Updates suchen",
      click: async () => {
        await checkForUpdates(true);
      }
    },
    { type: "separator" },
    {
      label: "Fenster ausblenden",
      click: () => {
        mainWindow?.hide();
      }
    },
    {
      label: "Beenden",
      click: async () => {
        isQuitting = true;
        await serverManager.stop();
        app.quit();
      }
    }
  ]);

  tray.setToolTip(`${appLabel}${state.running ? " aktiv" : " gestoppt"}`);
  tray.setContextMenu(menu);
}

function rebuildApplicationMenu() {
  const state = serverManager.getState();
  const appMenu: MenuItemConstructorOptions[] = isMac
    ? [
        {
          label: app.name,
          submenu: [
            {
              label: "Dashboard oeffnen",
              accelerator: "CommandOrControl+D",
              click: () => {
                void createMainWindow("dashboard");
              }
            },
            {
              label: "Einstellungen oeffnen",
              accelerator: "CommandOrControl+,",
              click: () => {
                void createMainWindow("settings");
              }
            },
            { type: "separator" },
            {
              role: "hide",
              label: "Caruso Reborn ausblenden"
            },
            { type: "separator" },
            {
              label: "Beenden",
              accelerator: "Command+Q",
              click: async () => {
                isQuitting = true;
                await serverManager.stop();
                app.quit();
              }
            }
          ]
        }
      ]
    : [];
  const serverMenu: MenuItemConstructorOptions[] = [
    {
      label: state.running ? "Server stoppen" : "Server starten",
      click: async () => {
        if (state.running) {
          await serverManager.stop();
        } else {
          await serverManager.start();
        }

        rebuildTray();
        rebuildApplicationMenu();
      }
    },
    {
      label: "Im Browser oeffnen",
      click: async () => {
        await ensureServerRunning();
        await shell.openExternal(getServerUrl());
      }
    }
  ];
  const updateMenu: MenuItemConstructorOptions[] = [
    {
      label: latestAvailableVersion
        ? `Update ${latestAvailableVersion} bereit`
        : "Nach Updates suchen",
      click: async () => {
        await checkForUpdates(true);
      }
    }
  ];
  const windowMenu: MenuItemConstructorOptions[] = [
    {
      label: "Dashboard",
      click: () => {
        void createMainWindow("dashboard");
      }
    },
    {
      label: "Einstellungen",
      click: () => {
        void createMainWindow("settings");
      }
    },
    {
      role: "minimize",
      label: "Minimieren"
    }
  ];
  const template: MenuItemConstructorOptions[] = [
    ...appMenu,
    {
      label: "Server",
      submenu: serverMenu
    },
    {
      label: "Updates",
      submenu: updateMenu
    },
    {
      label: "Fenster",
      submenu: windowMenu
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on("window-all-closed", () => {
  // Keep the app alive in the menu bar/tray when all windows are closed.
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("activate", () => {
  void createMainWindow("dashboard");
});

app.whenReady()
  .then(async () => {
    app.setName(appLabel);
    if (isMac) {
      app.dock?.hide();
    }

    configureAutoUpdates();
    await ensureServerRunning();
    rebuildTray();
    rebuildApplicationMenu();
    await createMainWindow("dashboard");
    void checkForUpdates(false);
  })
  .catch(async (error) => {
    await dialog.showErrorBox(
      `${appLabel} konnte nicht gestartet werden`,
      error instanceof Error ? error.message : "Unbekannter Fehler beim Start."
    );
    app.quit();
  });

ipcMain.handle("desktop:getServerState", async () => serverManager.getState());
ipcMain.handle("desktop:startServer", async () => {
  await serverManager.start();
  rebuildTray();
  rebuildApplicationMenu();
  return serverManager.getState();
});
ipcMain.handle("desktop:stopServer", async () => {
  await serverManager.stop();
  rebuildTray();
  rebuildApplicationMenu();
  return serverManager.getState();
});
ipcMain.handle("desktop:openBrowser", async () => {
  await ensureServerRunning();
  await shell.openExternal(getServerUrl());
  return true;
});
ipcMain.handle("desktop:showWindow", async (_event, section?: string) => {
  await createMainWindow(section);
  return true;
});
ipcMain.handle("desktop:chooseFolder", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});
