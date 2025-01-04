const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWindow;

app.on('ready', () => {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile('index.html');
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
});


app.whenReady().then(() => {
  app.commandLine.appendSwitch('enable-features', 'WebRTC');
});
