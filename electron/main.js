const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");

const isMac = process.platform === "darwin";

function createWindow(workspaceId = null) {
  const win = new BrowserWindow({
    width: 1560,
    height: 980,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: "#1b2026",
    title: "TriMark",
    autoHideMenuBar: !isMac,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const query = workspaceId ? { workspace: workspaceId } : undefined;
  win.loadFile(path.join(__dirname, "..", "editor.html"), { query });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  createWindow();

  ipcMain.handle("workspace:open-window", (_event, workspaceId) => {
    createWindow(workspaceId || null);
    return true;
  });

  ipcMain.handle("workspace:close-window", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
    return true;
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (!isMac) {
    app.quit();
  }
});
