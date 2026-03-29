'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsAPI', {
  getAll:         ()              => ipcRenderer.invoke('settings:get-all'),
  setApiKey:      (p, k)         => ipcRenderer.invoke('settings:set-api-key', p, k),
  removeApiKey:   (p)            => ipcRenderer.invoke('settings:remove-api-key', p),
  getTheme:       ()             => ipcRenderer.invoke('settings:get-theme'),
  setTheme:       (t)            => ipcRenderer.invoke('settings:set-theme', t),
  checkUpdates:   ()             => ipcRenderer.invoke('settings:check-updates'),
  getAppInfo:     ()             => ipcRenderer.invoke('settings:get-app-info'),
  openURL:        (url)          => ipcRenderer.invoke('settings:open-url', url),
  onThemeChanged: (listener) => {
    const wrapped = (_event, theme) => listener(theme);
    ipcRenderer.on('theme-changed', wrapped);
    return () => ipcRenderer.removeListener('theme-changed', wrapped);
  },
});
