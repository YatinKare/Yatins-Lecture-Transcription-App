const { Buffer } = window.electronAPI.Buffer;
const { NonRealTimeVAD } = window.electronAPI.NonRealTimeVAD;
const wavEncoder = window.electronAPI.wavEncoder;
const wavDecoder = window.electronAPI.wavDecoder;
const ffmpeg = window.electronAPI.ffmpeg;
const OpenAI = window.electronAPI.OpenAI;
//const WavEncoder = require('wav-encoder');

let mediaRecorder;
let audioChunks = [];
let isRecording = false;

const recordButton = document.getElementById('record');
const statusText = document.getElementById('status');
const boolLiveRecord = document.getElementById('live');

function resampleAudio(inputAudio, inputSampleRate, targetSampleRate) {
  const ratio = targetSampleRate / inputSampleRate;
  const resampled = new Float32Array(Math.floor(inputAudio.length * ratio));
  for (let i = 0; i < resampled.length; i++) {
    resampled[i] = inputAudio[Math.floor(i / ratio)];
  }
  return resampled;
}

async function getAudio(filePath) {
  const fs = window.electronAPI.fs;
  const { sampleRate, channelData } = await fs.readFile(filePath, (data) => {
    return data;
  }).then(function(buffer) {
    const data = wavDecoder.decode(buffer);
    return data;
  });
 // const audioBuffer = data.buffer();

  //const originalWavData = await wavDecoder.decode(audioBuffer);


  // const { sampleRate, channelData } = originalWavData;
  return  [sampleRate, channelData];
}

async function resampleSave(filePath) {
  const path = window.electronAPI.path;
  const dirname = window.electronAPI.__dirname;

  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext);

  const newFileName = `${baseName}_reSampled${ext}`;
  const newFilePath = path.join(dir, newFileName);

  const result = ffmpeg(filePath).audioFrequency(16000).saveToFile(newFilePath);
  return newFilePath;
}

async function audioSplit(filePath, outputDir) {
  // Store the input file path
  let FILEPATH = filePath;
  const path = window.electronAPI.path;
  const fs = window.electronAPI.fs;

  // Get audio data from the file
  let [ originalSampleRate, originalChannelData ] = await getAudio(FILEPATH);
  statusText.textContent = "Audio Data Extracted";
  // Extract first channel of audio data
  const originalAudioData = originalChannelData[0];

  console.log('Original samplerate: ', originalSampleRate);
  console.log('Original Audio Data: ', originalAudioData);

  // Resample audio to 16kHz if needed for VAD processing
  const tempDir = path.join(outputDir, 'temp');
  if (originalSampleRate != 16000) {
    if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
    }
    await resampleSave(FILEPATH).then((result) => { FILEPATH = result });
    statusText.textContent = "Audio Resampled to 16000";
  }

  const [ vadSampleRate, vadChannelData ] = await getAudio(FILEPATH);
  const vadAudioData = vadChannelData[0];

  statusText.textContent = "Loading VAD Model...";
  const vad = await NonRealTimeVAD.new();
  let timestamps = [];

  for await (const {start, end} of vad.run(vadAudioData, vadSampleRate)) {
    statusText.textContent = `VAD Processing... Total Segments: ${timestamps.length}`;
    timestamps.push({
      "start": start,
      "end": end
    });
  }

  let merged_timestamps = [];
  let current = timestamps[0];
  
  for (let i = 0; i < timestamps.length; i++) {
    const next = timestamps[i];
    if (next.start - current.end <= 1000) {
      current.end = Math.max(current.end, next.end);
    } else {
      merged_timestamps.push(current);
      current = next;
    }
  }
  for (let i = 0; i < merged_timestamps.length; i++) {
    console.log(`Total segment length: ${(merged_timestamps[i].end- merged_timestamps[i].start) / 1000}`);
  }

  let i = 0;
  while (i < merged_timestamps.length) {
    const segment = merged_timestamps[i];
    const duration = segment.end - segment.start;

    if (duration < 60000) {
      if (i + 1 < merged_timestamps.length) {
        merged_timestamps[i].end = merged_timestamps[i + 1].end;
        merged_timestamps.splice(i + 1, 1);
      } else if ( i - 1 >= 0) {
        merged_timestamps[i - 1].end = merged_timestamps[i].end;
        merged_timestamps.splice(i, 1);
        i--;
      }
    } else {
      i++;
    }
  }

  for (let i = 0; i < merged_timestamps.length; i++) {
    const current_segment = merged_timestamps[i]; 
    const audioStart = originalSampleRate * (current_segment.start / 1000);
    const audioEnd = originalSampleRate * (current_segment.end/ 1000);
    const slicedSegment = originalAudioData.slice(audioStart, audioEnd);

    

    
    const slicedAudioData = await wavEncoder.encode({
        sampleRate: originalSampleRate,
        channelData: [slicedSegment]
      }).then((buffer) => {
        const chunkPath = path.join(tempDir, `chunk_${i}.wav`);
        fs.writeFileSync(chunkPath, new Buffer(buffer));
        statusText.textContent = `Saved combined chunk ${i}`;
        /*
        console.log(
          `Saved combined chunk ${i} to ${chunkPath}`
        );
        */
      });
  }

  let total_len = 0;
  for (let j = 0; j < merged_timestamps.length; j++) {
    const cur = merged_timestamps[j];
    total_len += cur.end - cur.start;
  }
  console.log(`Original length: ${(originalAudioData.length / originalSampleRate)}`);
  console.log(`New total length: ${total_len / 1000}`);
  return tempDir;
}

recordButton.addEventListener('click', async () => {
  if (boolLiveRecord.checked) {
    if (!isRecording) {
      // Start recording here
      isRecording = true;
      recordButton.textContent = 'Stop Recording';
      statusText.textContent = 'Status: Recording...';

      // Mic Access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.start();

      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        const arrayBuffer = await audioBlob.arrayBuffer();

        const audioContext = new AudioContext();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const channelData = audioBuffer.getChannelData(0);

        const wavBuffer = await wavEncoder.encode({
          sampleRate: audioBuffer.sampleRate,
          channelData: [channelData],
        });

        const fs = window.electronAPI.fs;
        const path = window.electronAPI.path;

        const date = new Date().toLocaleDateString('en-US').replace(/\//g, '-');
        const dirPath = path.join(dirname, 'resources', date);
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }

        const filePath = path.join(dirPath, 'recording.wav');
        fs.writeFileSync(filePath, Buffer.from(wavBuffer));

        statusText.textContent = `Status: Saved to ${filePath}`;

        splitAudio(filePath, dirPath).then((tempDir) => {
          console.log(`Chunks saved in: ${tempDir}`);
        });

      };
    } else {
      isRecording = false;
      recordButton.textContent = 'Start Recording';
      statusText.textContent = 'Status: Processing...';
      mediaRecorder.stop();

    }
  } else {
    const path = window.electronAPI.path;
    const dirname = window.electronAPI.__dirname;

    const date = new Date().toLocaleDateString('en-US').replace(/\//g, '-');
    const dirPath = path.join(dirname, 'resources', date);
    const filePath = path.join(dirPath, 'New Recording 2.wav');
    let tempDir = await audioSplit(filePath, dirPath);

    statusText.textContent = "Processing OpenAI...";
    /*

    const fs = window.electronAPI.fs;
    const files = fs.readdirSync(tempDir);

    const openai = new OpenAI({
      apiKey: window.env.OPENAI_API_KEY,
    });

    for (const file of files) {
      const filePath = path.join(tempDir, file);
      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: "whisper-1",
      });
      console.log(transcription);
    }
    */
  }
});
