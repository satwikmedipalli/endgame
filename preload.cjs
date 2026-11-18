"use strict";

// src/preload.ts
var import_electron = require("electron");
var api = {
  getConfig: () => import_electron.ipcRenderer.invoke("config:get"),
  saveConfig: (c) => import_electron.ipcRenderer.invoke("config:save", c),
  helperState: () => import_electron.ipcRenderer.invoke("helper:state"),
  onHelperState: (cb) => {
    const fn = (_, s) => cb(s);
    import_electron.ipcRenderer.on("helper:state", fn);
    return () => import_electron.ipcRenderer.off("helper:state", fn);
  },
  helperLog: () => import_electron.ipcRenderer.invoke("helper:log"),
  openLog: () => import_electron.ipcRenderer.send("helper:open-log"),
  setTheme: (mode) => import_electron.ipcRenderer.send("theme", mode),
  setProgress: (p) => import_electron.ipcRenderer.send("progress", p),
  openExternal: (url) => import_electron.ipcRenderer.send("open-external", url),
  copy: (text) => import_electron.ipcRenderer.send("copy", text),
  quit: () => import_electron.ipcRenderer.send("quit"),
  onCommand: (cb) => {
    const fn = (_, c) => cb(c);
    import_electron.ipcRenderer.on("command", fn);
    return () => import_electron.ipcRenderer.off("command", fn);
  },
  updateState: () => import_electron.ipcRenderer.invoke("update:state"),
  checkForUpdate: () => import_electron.ipcRenderer.invoke("update:check"),
  onUpdateState: (cb) => {
    const fn = (_, s) => cb(s);
    import_electron.ipcRenderer.on("update:state", fn);
    return () => import_electron.ipcRenderer.off("update:state", fn);
  },
  restartToUpdate: () => import_electron.ipcRenderer.send("update:restart"),
  getLoginItem: () => import_electron.ipcRenderer.invoke("login-item:get"),
  setLoginItem: (on) => import_electron.ipcRenderer.send("login-item:set", on)
};
import_electron.contextBridge.exposeInMainWorld("endgame", api);
