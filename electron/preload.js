const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("trimarkDesktop", {
  isDesktopApp: true,
  openWorkspaceWindow(workspaceId) {
    return ipcRenderer.invoke("workspace:open-window", workspaceId || null);
  },
  closeWorkspaceWindow() {
    return ipcRenderer.invoke("workspace:close-window");
  },
});
