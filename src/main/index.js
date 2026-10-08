"use strict";

const path = require("node:path");
const {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  shell,
  Tray
} = require("electron");
const { SettingsStore } = require("./config/settings-store");
const { ContextPipeline } = require("./context/context-provider");
const { ScreenshotContextProvider } = require("./context/screenshot-context-provider");
const { calculatePopupPosition } = require("./core/geometry");
const { MacOSLongPressHotkey, parseAccelerator } = require("./platform/macos-hotkey");
const { ProviderRegistry } = require("./providers/provider-registry");
const { CaptureService } = require("./services/capture-service");

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const WINDOW_COMPACT_SIZE = { width: 472, height: 450 };
const WINDOW_EXPANDED_SIZE = { width: 472, height: 590 };
const PERMISSION_URLS = {
  input: "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent",
  screen: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
};

app.setName("CursorLens");

let mainWindow;
let tray;
let settingsStore;
let hotkeyMonitor;
let contextPipeline;
let currentContext = null;
let activeRequest = null;
let windowReady;
let inputPermissionPromptShown = false;
let currentWindowSize = WINDOW_COMPACT_SIZE;
let registeredShortcut = null;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function createTrayImage() {
  const svg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
      <path fill="black" d="M3 2.2v12.4l3.15-3.02 2.2 4.42 2.15-1.08-2.12-4.2H13L3 2.2Zm2 4.47 3.07 2.55H6.9l-.65.62L5 11.05V6.67Z"/>
    </svg>
  `);
  const image = nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${svg}`);
  image.setTemplateImage(true);
  return image;
}

function createWindow() {
  let resolveReady;
  windowReady = new Promise((resolve) => {
    resolveReady = resolve;
  });

  mainWindow = new BrowserWindow({
    ...WINDOW_COMPACT_SIZE,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: false,
    alwaysOnTop: true,
    title: "CursorLens",
    webPreferences: {
      preload: path.join(PROJECT_ROOT, "src/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setAlwaysOnTop(true, "floating");
  mainWindow.loadFile(path.join(PROJECT_ROOT, "src/renderer/index.html"));
  mainWindow.webContents.once("did-finish-load", resolveReady);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  mainWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function positionAndShow(cursorPoint = screen.getCursorScreenPoint()) {
  const display = screen.getDisplayNearestPoint(cursorPoint);
  const position = calculatePopupPosition(display.workArea, cursorPoint, currentWindowSize);
  mainWindow.setBounds({ ...position, ...currentWindowSize }, false);
  mainWindow.show();
  mainWindow.focus();
}

function setWindowExpanded(expanded) {
  const nextSize = expanded ? WINDOW_EXPANDED_SIZE : WINDOW_COMPACT_SIZE;
  if (
    currentWindowSize.width === nextSize.width &&
    currentWindowSize.height === nextSize.height
  ) {
    return;
  }

  currentWindowSize = nextSize;
  const bounds = mainWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const x = Math.min(
    Math.max(bounds.x, display.workArea.x),
    display.workArea.x + display.workArea.width - nextSize.width
  );
  const y = Math.min(
    Math.max(bounds.y, display.workArea.y),
    display.workArea.y + display.workArea.height - nextSize.height
  );
  mainWindow.setBounds({ x, y, ...nextSize }, true);
}

async function captureAndShow() {
  if (mainWindow.isVisible()) {
    mainWindow.hide();
    await delay(120);
  }

  const cursorPoint = screen.getCursorScreenPoint();
  setWindowExpanded(false);
  let captureError = null;
  try {
    currentContext = await contextPipeline.collect();
    console.log(
      `[capture] ${currentContext.screenshot.image.width}x${currentContext.screenshot.image.height}px, ` +
        `pointer ${currentContext.screenshot.cursor.x},${currentContext.screenshot.cursor.y}`
    );
  } catch (error) {
    currentContext = null;
    captureError = { code: error.code || "CAPTURE_FAILED", message: error.message };
    console.warn(`[capture] ${error.message}`);
  }

  await windowReady;
  mainWindow.webContents.send("context:updated", {
    screenshot: currentContext?.screenshot || null,
    error: captureError
  });
  positionAndShow(cursorPoint);
}

async function showSettings() {
  await windowReady;
  setWindowExpanded(true);
  positionAndShow();
  mainWindow.webContents.send("settings:open");
}

function createTray() {
  tray = new Tray(createTrayImage());
  tray.setToolTip("CursorLens");
  // A text label makes the menu bar presence unambiguous even if macOS fails
  // to render the tiny template image in an unsigned development build.
  if (process.platform === "darwin") tray.setTitle("CursorLens");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "在鼠标旁打开", click: () => captureAndShow() },
      { label: "设置…", click: () => showSettings() },
      { type: "separator" },
      {
        label: "打开输入监控权限",
        click: () => shell.openExternal(PERMISSION_URLS.input)
      },
      {
        label: "打开屏幕录制权限",
        click: () => shell.openExternal(PERMISSION_URLS.screen)
      },
      { type: "separator" },
      {
        label: "退出 CursorLens",
        click: () => {
          app.isQuitting = true;
          app.quit();
        }
      }
    ])
  );
  tray.on("click", () => captureAndShow());
}

function handleHotkeyStatus(status) {
  if (status.type === "ready") {
    console.log(`[hotkey] ${status.message || "ready"}`);
    if (
      status.message === "PERMISSION_OK" &&
      settingsStore.getRuntimeSettings().triggerMode === "hold"
    ) {
      unregisterPressShortcut();
    }
    return;
  }

  if (status.type === "permission-required") {
    registerPressShortcut(true);
    if (!inputPermissionPromptShown) {
      inputPermissionPromptShown = true;
      setTimeout(async () => {
        const result = await dialog.showMessageBox({
          type: "info",
          title: "CursorLens 需要输入监控权限",
          message: "允许输入监控后，CursorLens 才能识别全局快捷键的长按与松开。",
          detail: "未授权时快捷键会自动退化为按一次立即打开。授权后请重新启动 CursorLens。",
          buttons: ["打开系统设置", "稍后"],
          defaultId: 0,
          cancelId: 1
        });
        if (result.response === 0) await shell.openExternal(PERMISSION_URLS.input);
      }, 350);
    }
    return;
  }

  console.warn(`[hotkey] ${status.message || status.type}`);
  if (status.type === "error") registerPressShortcut(true);
}

function unregisterPressShortcut() {
  if (!registeredShortcut) return;
  globalShortcut.unregister(registeredShortcut);
  registeredShortcut = null;
}

function registerPressShortcut(isFallback = false) {
  const accelerator = settingsStore.getRuntimeSettings().hotkey;
  if (registeredShortcut === accelerator && globalShortcut.isRegistered(accelerator)) return;
  unregisterPressShortcut();
  if (globalShortcut.register(accelerator, captureAndShow)) {
    registeredShortcut = accelerator;
    console.log(
      `[hotkey] ${isFallback ? "Input Monitoring unavailable; using fallback" : "Press"} ${accelerator}`
    );
  } else {
    console.warn(`[hotkey] Could not register shortcut ${accelerator}`);
  }
}

function startHotkeyMonitor() {
  const settings = settingsStore.getRuntimeSettings();
  unregisterPressShortcut();
  hotkeyMonitor.stop();
  if (settings.triggerMode === "hold") {
    hotkeyMonitor.start(settings);
    console.log(`[hotkey] Hold ${settings.hotkey} for ${settings.holdDurationMs}ms`);
  } else {
    registerPressShortcut(false);
  }
}

function registerIpc() {
  ipcMain.handle("app:bootstrap", () => ({
    settings: settingsStore.getPublicSettings(),
    screenshot: currentContext?.screenshot || null,
    platform: process.platform
  }));

  ipcMain.handle("overlay:hide", () => {
    mainWindow.hide();
  });

  ipcMain.handle("overlay:set-expanded", (_event, expanded) => {
    setWindowExpanded(Boolean(expanded));
  });

  ipcMain.handle("context:refresh", async () => {
    await captureAndShow();
    return { ok: true };
  });

  ipcMain.handle("permissions:open", async (_event, kind) => {
    const url = PERMISSION_URLS[kind];
    if (!url) throw new Error("Unknown permission kind.");
    await shell.openExternal(url);
    return { ok: true };
  });

  ipcMain.handle("settings:save", (_event, input) => {
    parseAccelerator(input.hotkey);
    const publicSettings = settingsStore.save(input);
    startHotkeyMonitor();
    return publicSettings;
  });

  ipcMain.handle("assistant:cancel", () => {
    activeRequest?.controller.abort();
    activeRequest = null;
  });

  ipcMain.handle("assistant:ask", async (_event, payload) => {
    const question = typeof payload?.question === "string" ? payload.question.trim() : "";
    if (!question) throw new Error("请输入问题。");
    if (question.length > 4000) throw new Error("问题过长，请控制在 4000 字以内。");
    if (!currentContext?.screenshot) throw new Error("当前没有可用截图，请先重新截取。");

    activeRequest?.controller.abort();
    const requestId = payload.requestId || `${Date.now()}`;
    const controller = new AbortController();
    activeRequest = { requestId, controller };

    const provider = new ProviderRegistry().get();
    try {
      const answer = await provider.streamAnswer({
        question,
        screenshot: currentContext.screenshot,
        settings: settingsStore.getRuntimeSettings(),
        signal: controller.signal,
        onDelta: (text) => {
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send("assistant:stream", { requestId, type: "delta", text });
          }
        }
      });
      mainWindow.webContents.send("assistant:stream", { requestId, type: "done" });
      return { requestId, answer };
    } catch (error) {
      const message = error.name === "AbortError" ? "已停止生成。" : error.message;
      mainWindow.webContents.send("assistant:stream", {
        requestId,
        type: error.name === "AbortError" ? "cancelled" : "error",
        message
      });
      if (error.name !== "AbortError") throw error;
      return { requestId, answer: "" };
    } finally {
      if (activeRequest?.requestId === requestId) activeRequest = null;
    }
  });
}

async function initialize() {
  if (process.platform !== "darwin") {
    await dialog.showMessageBox({
      type: "error",
      message: "这个 Demo 当前为 macOS 版本。"
    });
    app.quit();
    return;
  }

  // Keep the Dock icon visible. The app also has a menu bar item, but hiding
  // the Dock made first launches look like they had silently failed.
  app.dock?.show();
  settingsStore = new SettingsStore({
    userDataPath: app.getPath("userData"),
    projectRoot: PROJECT_ROOT,
    isPackaged: app.isPackaged
  });

  const captureService = new CaptureService();
  contextPipeline = new ContextPipeline([
    new ScreenshotContextProvider(captureService, () => settingsStore.getRuntimeSettings().captureSize)
  ]);

  createWindow();
  createTray();
  registerIpc();

  hotkeyMonitor = new MacOSLongPressHotkey({
    projectRoot: PROJECT_ROOT,
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    onTrigger: captureAndShow,
    onStatus: handleHotkeyStatus
  });
  startHotkeyMonitor();

  // A packaged app should visibly respond to a Finder launch. Development
  // `npm start` remains tray-only; `npm run demo` keeps the same visible path.
  if (app.isPackaged || process.argv.includes("--demo")) {
    setTimeout(captureAndShow, 1200);
  }
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on("second-instance", () => captureAndShow());
  app.on("activate", () => {
    if (mainWindow) captureAndShow();
  });
  app.whenReady().then(initialize);
}

app.on("window-all-closed", () => {
  // Tray app: stay alive until the user explicitly quits.
});

app.on("before-quit", () => {
  app.isQuitting = true;
  globalShortcut.unregisterAll();
  hotkeyMonitor?.stop();
  activeRequest?.controller.abort();
});
