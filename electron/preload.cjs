const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopControls", {
  getServerState: () => ipcRenderer.invoke("desktop:getServerState"),
  startServer: () => ipcRenderer.invoke("desktop:startServer"),
  stopServer: () => ipcRenderer.invoke("desktop:stopServer"),
  openBrowser: () => ipcRenderer.invoke("desktop:openBrowser"),
  chooseFolder: () => ipcRenderer.invoke("desktop:chooseFolder")
});
