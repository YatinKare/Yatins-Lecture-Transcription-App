const { contextBridge } = require('electron');
const fs = require('fs');
const path = require('path');
const { Buffer } = require('buffer');
const { NonRealTimeVAD } = require('@ricky0123/vad-web');
const wavEncoder = require('wav-encoder');
const wavDecoder = require('wav-decoder');
const ffmpeg = require("fluent-ffmpeg");
const OpenAI = require('openai');
/*
window.electronAPI = {
  fs,
  path,
  bufferFrom: (arrayBuffer) => Buffer.from(arrayBuffer),
};
*/

contextBridge.exposeInMainWorld('electronAPI', {
  fs,
  path,
  bufferFrom: (arrayBuffer) => Buffer.from(arrayBuffer),
  Buffer,
  NonRealTimeVAD,
  wavEncoder,
  wavDecoder,
  ffmpeg,
  OpenAI,
  __dirname: __dirname,
});

contextBridge.exposeInMainWorld('env', {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
});
