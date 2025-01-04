const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const vad = require('@ricky0123/vad');

const resourcesPath = path.join(__dirname, 'resources');
const tempDir = path.join(resourcesPath, 'temp');
const transcriptionDir = path.join(resourcesPath, 'transcription');

const processAudio = async ({ filePath, apiKey }) => {
  // Clean up or create directories
  await fs.emptyDir(tempDir);
  await fs.ensureDir(transcriptionDir);

  // Initialize VAD
  const vadProcessor = new vad();
  const chunks = await vadProcessor.processFile(filePath);
  console.log(`Detected ${chunks.length} chunks.`);

  // Save chunks to temp directory
  for (const [index, chunk] of chunks.entries()) {
    const chunkPath = path.join(tempDir, `chunk_${index + 1}.wav`);
    await fs.writeFile(chunkPath, Buffer.from(chunk.audioBuffer));
  }

  // Transcribe chunks using OpenAI Whisper API
  const transcriptionFile = path.join(transcriptionDir, 'transcription.txt');
  const transcription = [];
  for (const fileName of fs.readdirSync(tempDir)) {
    const chunkPath = path.join(tempDir, fileName);
    const transcriptionText = await transcribeChunk(chunkPath, apiKey); // Pass key here
    transcription.push(transcriptionText);
  }

  await fs.writeFile(transcriptionFile, transcription.join('\n'));
  console.log(`Transcription saved to ${transcriptionFile}`);
};

const transcribeChunk = async (filePath, apiKey) => {
  const formData = new FormData();
  formData.append('file', fs.createReadStream(filePath));
  formData.append('model', 'whisper-1');

  const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
    headers: {
      Authorization: `Bearer ${apiKey}`, // Use the key here
      ...formData.getHeaders(),
    },
  });

  return response.data.text;
};

module.exports = processAudio;
