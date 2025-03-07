const { app, BrowserWindow } = require('electron');
const path = require('path');

// Add these debug lines
console.log('Directory name:', __dirname);
console.log('Preload path:', path.join(__dirname, 'preload.js'));

let mainWindow;

app.on('ready', () => {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      //nodeIntegration: true,
      nodeIntegration: false,
      //contextIsolation: false,
      contextIsolation: true,
      sandbox: false
    },
  });

  // Add this temporarily for debugging
  mainWindow.webContents.openDevTools();
  
  mainWindow.loadFile('index.html');
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
});


app.whenReady().then(() => {
  app.commandLine.appendSwitch('enable-features', 'WebRTC');
});
