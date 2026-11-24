/*
 * Renderer bridge. Everything the console can ask the desktop agent to do goes
 * through this narrow, explicit API — the renderer never gets Node access.
 */

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('agent', {
  isElectron: true,
  platform: process.platform,

  bootstrap: () => ipcRenderer.invoke('agent:bootstrap'),
  identify: (user) => ipcRenderer.invoke('agent:identify', user),
  clockIn: () => ipcRenderer.invoke('agent:clock-in'),
  clockOut: () => ipcRenderer.invoke('agent:clock-out'),
  startBreak: () => ipcRenderer.invoke('agent:break-start'),
  endBreak: () => ipcRenderer.invoke('agent:break-end'),
  log: (event) => ipcRenderer.invoke('agent:log', event),
  setPolicy: (policy) => ipcRenderer.invoke('agent:set-policy', policy),
  setDeviceStatus: (status) => ipcRenderer.invoke('agent:set-device-status', status),
  openExternal: (url) => ipcRenderer.invoke('agent:open-external', url),
  onChanged: (callback) => subscribe('agent:changed', callback),

  browser: {
    open: (url) => ipcRenderer.invoke('agent:browser-open', url),
    close: () => ipcRenderer.invoke('agent:browser-close'),
    navigate: (url) => ipcRenderer.invoke('agent:browser-navigate', url),
    action: (name) => ipcRenderer.invoke('agent:browser-action', name),
    state: () => ipcRenderer.invoke('agent:browser-state'),
    visible: (visible) => ipcRenderer.send('agent:browser-visible', Boolean(visible)),
    bounds: (rect) => ipcRenderer.send('agent:browser-bounds', rect),
    onState: (callback) => subscribe('agent:browser-state', callback),
    onBlocked: (callback) => subscribe('agent:browser-blocked', callback),
  },
});
