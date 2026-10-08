"use strict";

const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("cursorLens", {
  bootstrap: () => ipcRenderer.invoke("app:bootstrap"),
  hide: () => ipcRenderer.invoke("overlay:hide"),
  setExpanded: (expanded) => ipcRenderer.invoke("overlay:set-expanded", expanded),
  refreshContext: () => ipcRenderer.invoke("context:refresh"),
  ask: (payload) => ipcRenderer.invoke("assistant:ask", payload),
  cancel: () => ipcRenderer.invoke("assistant:cancel"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  openPermission: (kind) => ipcRenderer.invoke("permissions:open", kind),
  onContextUpdated: (callback) => subscribe("context:updated", callback),
  onAssistantStream: (callback) => subscribe("assistant:stream", callback),
  onOpenSettings: (callback) => subscribe("settings:open", callback)
});
