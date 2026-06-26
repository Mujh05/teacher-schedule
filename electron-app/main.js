const { app, BrowserWindow, Menu, ipcMain, Notification } = require("electron");
const path = require("path");
const fs = require("fs");
const { autoUpdater } = require("electron-updater");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    title: "英语单词排课管理",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js")
    }
  });

  mainWindow.loadFile(path.join(__dirname, "src", "index.html"));
  Menu.setApplicationMenu(null);

  mainWindow.on("closed", () => { mainWindow = null; });
}

// ---- 自动更新 ----
function setupAutoUpdater() {
  // 私有仓库认证：GitHub provider 通过 GH_TOKEN 环境变量读取
  // ↓ 替换为你的只读 token（仅需 Contents: Read-only 权限）
  process.env.GH_TOKEN = "YOUR_READONLY_TOKEN_HERE";

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    console.log("正在检查更新...");
  });

  autoUpdater.on("update-available", (info) => {
    console.log("发现新版本:", info.version);
    if (mainWindow) {
      mainWindow.webContents.send("update-available", info.version);
    }
  });

  autoUpdater.on("update-not-available", () => {
    console.log("当前已是最新版本");
  });

  autoUpdater.on("download-progress", (progress) => {
    if (mainWindow) {
      mainWindow.webContents.send("update-progress", progress.percent);
    }
  });

  autoUpdater.on("update-downloaded", () => {
    if (mainWindow) {
      mainWindow.webContents.send("update-downloaded");
    }
  });

  autoUpdater.on("error", (err) => {
    console.log("更新出错:", err.message);
  });

  // 启动后 3 秒检查更新
  setTimeout(() => {
    autoUpdater.checkForUpdates();
  }, 3000);
}

// ---- 处理来自渲染进程的更新操作 ----
ipcMain.handle("download-update", () => {
  autoUpdater.downloadUpdate();
});

ipcMain.handle("install-update", () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle("check-update", () => {
  autoUpdater.checkForUpdates();
});

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();
});
app.on("window-all-closed", () => { app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ---- IPC: Windows 原生通知 ----
ipcMain.handle('notify', (event, title, body) => {
  if (Notification.isSupported()) {
    new Notification({ title, body, silent: false }).show();
    return true;
  }
  return false;
});

// ---- IPC: 数据文件持久化 ----
const dataDir = path.join(app.getPath("userData"), "schedule-data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dataPath = path.join(dataDir, "schedule_data.json");

ipcMain.handle('saveData', (event, json) => {
  try {
    fs.writeFileSync(dataPath, json, "utf8");
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('loadData', () => {
  try {
    if (fs.existsSync(dataPath)) {
      return { ok: true, data: JSON.parse(fs.readFileSync(dataPath, "utf8")) };
    }
    return { ok: true, data: { students: [], schedules: [] } };
  } catch (e) { return { ok: false, error: e.message, data: { students: [], schedules: [] } }; }
});
