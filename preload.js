const fs = require('fs');
const path = require('path');
const { Buffer } = require('buffer');

window.electronAPI = {
  fs,
  path,
  bufferFrom: (arrayBuffer) => Buffer.from(arrayBuffer),
};
