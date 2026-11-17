// Exposes a small, fixed API to the window. The page never gets Node or Electron itself.
import { contextBridge, ipcRenderer } from 'electron';

import type { Command, EndgameApi, EndgameConfig, HelperState } from './api';

const api: EndgameApi = {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (c: EndgameConfig) => ipcRenderer.invoke('config:save', c),
  helperState: () => ipcRenderer.invoke('helper:state'),
  onHelperState: (cb) => {
    const fn = (_: unknown, s: HelperState) => cb(s);
    ipcRenderer.on('helper:state', fn);
    return () => ipcRenderer.off('helper:state', fn);
  },
  helperLog: () => ipcRenderer.invoke('helper:log'),
  openLog: () => ipcRenderer.send('helper:open-log'),
  setTheme: (mode) => ipcRenderer.send('theme', mode),
  setProgress: (p) => ipcRenderer.send('progress', p),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  copy: (text) => ipcRenderer.send('copy', text),
  quit: () => ipcRenderer.send('quit'),
  onCommand: (cb) => {
    const fn = (_: unknown, c: Command) => cb(c);
    ipcRenderer.on('command', fn);
    return () => ipcRenderer.off('command', fn);
  },
  getLoginItem: () => ipcRenderer.invoke('login-item:get'),
  setLoginItem: (on) => ipcRenderer.send('login-item:set', on),
};

contextBridge.exposeInMainWorld('endgame', api);
