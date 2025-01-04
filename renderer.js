const { Buffer } = require('buffer');
const { NonRealTimeVAD } = require('@ricky0123/vad-web');
const wavEncoder = require('wav-encoder');
const wavDecoder = require('wav-decoder');
const { time } = require('console');

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


async function splitAudio(filePath, outputDir) {
  const fs = window.electronAPI.fs;
  const path = window.electronAPI.path;

  const audioBuffer = fs.readFileSync(filePath);

  const wavData = await wavDecoder.decode(audioBuffer);
  console.log('Original samplerate:', wavData.sampleRate);
  const { sampleRate, channelData } = wavData;

  const audioData = channelData[0];

  const targetSampleRate = 16000
  const resampledAudioData = sampleRate !== targetSampleRate
    ? resampleAudio(audioData, sampleRate, targetSampleRate)
    : audioData;

  console.log(`Minimum Speech Frames: ${Math.floor(1 * targetSampleRate/160)}`);

  const vad = await NonRealTimeVAD.new({
    minSpeechFrames: Math.floor(1 * targetSampleRate/160),
  });

  console.log("Detecting Speech...");
  const tempDir = path.join(outputDir, 'temp');

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  let chunkIndex = 0;
  let timestamps = [];
  for await (const { audio, start, end } of vad.run(resampledAudioData, targetSampleRate)) {

    console.log(`Detected speech: Start = ${start}ms, End = ${end}ms`);
    timestamps.push({ start, end });
  }

  console.log(typeof(timestamps[0].start));

  let merged_timestamps = []
  for (let segment in timestamps) {
    console.log(segment);
    if (merged_timestamps.length) {
      prev_segment = merged_timestamps[merged_timestamps.length - 1];
      if (segment.start - prev_segment.end < 1 * 16000) {
        prev_segment.end = segment.end;
      } else {
        merged_timestamps.push(segment)
      }
    } else {
      merged_timestamps.push(segment)
    }
  }
  console.log(merged_timestamps);

  

  if (timestamps.length > 0 && timestamps[0].start > 0) {
    timestamps.unshift({start:0, end:timestamps[0].start});
  }
  // Convert VAD timestamps to original sample rate scale
  const mappedTimestamps = timestamps.map(({ start, end }) => ({
    start: Math.floor((start / 1000) * sampleRate),
    end: Math.ceil((end / 1000) * sampleRate),
  }));

  console.log("maped times: ", mappedTimestamps);

  /* Chunk the original audio using the mapped timestamps
  for (const { start, end } of mappedTimestamps) {
      const chunkAudio = audioData.slice(start, end);

      const chunkBuffer = await wavEncoder.encode({
          sampleRate: sampleRate, // Use original sample rate
          channelData: [chunkAudio],
      });

      const chunkPath = path.join(tempDir, `chunk_${++chunkIndex}.wav`);
      fs.writeFileSync(chunkPath, Buffer.from(chunkBuffer));
      console.log(`Saved chunk ${chunkIndex} (${start / sampleRate}s - ${end / sampleRate}s) to ${chunkPath}`);
  }
      */
  const MIN_CHUNK_DURATION = 60000; // 1 minute in milliseconds

  let combinedStart = null;
  let combinedAudio = [];
  let previousEnd = 0;

  for (const { start, end } of mappedTimestamps) {
    if (start >= end || start < 0 || end > audioData.length) {
      console.error(`Invalid slice indices for chunk ${chunkIndex + 1}: Start = ${start}, End = ${end}`);
      continue;
    }
    const chunkDuration = ((end - start) / sampleRate) * 1000; // Duration in milliseconds
  
    if (chunkDuration < MIN_CHUNK_DURATION) {
      if (combinedStart === null) combinedStart = start;

      const slicedAudio = audioData.slice(start, end);
      const newCombinedAudio = new Float32Array(combinedAudio.length + slicedAudio.length);
      newCombinedAudio.set(combinedAudio, 0);
      newCombinedAudio.set(slicedAudio, combinedAudio.length);
      combinedAudio = newCombinedAudio;
  
  
      const combinedDuration = ((end - combinedStart) / sampleRate) * 1000;
      if (combinedDuration >= MIN_CHUNK_DURATION) {
        try {
            // Flatten combinedAudio into a single Float32Array
            const flattenedAudio = new Float32Array(
              combinedAudio.reduce((totalLength, chunk) => totalLength + chunk.length, 0)
            );
            let offset = 0;
            for (const chunk of combinedAudio) {
              flattenedAudio.set(chunk, offset);
              offset += chunk.length;
            }        

          const chunkBuffer = await wavEncoder.encode({
            sampleRate: sampleRate,
            channelData: [flattenedAudio],
          });
  
          if (!chunkBuffer || chunkBuffer.length === 0) {
            console.error("Encoded buffer is empty! Skipping file save.");
            continue;
          }
  
          const chunkPath = path.join(tempDir, `chunk_${++chunkIndex}.wav`);
          fs.writeFileSync(chunkPath, Buffer.from(chunkBuffer));
          console.log(
            `Saved combined chunk ${chunkIndex} (${combinedStart / sampleRate}s - ${end / sampleRate}s) to ${chunkPath}`
          );
  
          console.log('Resetting combinedStart and combinedAudio');
          combinedStart = null;
          combinedAudio = [];
        } catch (error) {
          console.error("Failed to save combined chunk:", error);
        }
      }
    } else {
      if (combinedAudio.length > 0) {
        try {
          const chunkBuffer = await wavEncoder.encode({
            sampleRate: sampleRate,
            channelData: [new Float32Array(combinedAudio)],
          });
  
          if (!chunkBuffer || chunkBuffer.length === 0) {
            console.error("Encoded buffer is empty! Skipping file save.");
            continue;
          }
  
          const chunkPath = path.join(tempDir, `chunk_${++chunkIndex}.wav`);
          fs.writeFileSync(chunkPath, Buffer.from(chunkBuffer));
          console.log(
            `Saved combined chunk ${chunkIndex} (${combinedStart / sampleRate}s - ${previousEnd / sampleRate}s) to ${chunkPath}`
          );
  
          combinedStart = null;
          combinedAudio = [];
        } catch (error) {
          console.error("Failed to save combined chunk:", error);
        }
      }
  
      const chunkAudio = audioData.slice(start, end);

      if (!chunkAudio || chunkAudio.length === 0) {
        console.error(`Chunk ${chunkIndex + 1} is empty: Start = ${start}, End = ${end}`);
        continue; 
      }

      try {
        const chunkBuffer = await wavEncoder.encode({
          sampleRate: sampleRate,
          channelData: [chunkAudio],
        });
  
        if (!chunkBuffer || chunkBuffer.length === 0) {
          console.error("Encoded buffer is empty! Skipping file save.");
          continue;
        }
  
        const chunkPath = path.join(tempDir, `chunk_${++chunkIndex}.wav`);
        fs.writeFileSync(chunkPath, Buffer.from(chunkBuffer));
        console.log(`Saved chunk ${chunkIndex} (${start / sampleRate}s - ${end / sampleRate}s) to ${chunkPath}`);
      } catch (error) {
        console.error("Failed to save chunk:", error);
      }
    }
  
    previousEnd = end;
  }
  
  // Finalize the last combined chunk
  if (combinedAudio.length > 0) {
    try {
      const chunkBuffer = await wavEncoder.encode({
        sampleRate: sampleRate,
        channelData: [new Float32Array(combinedAudio)],
      });
  
      if (!chunkBuffer || chunkBuffer.length === 0) {
        console.error("Encoded buffer is empty! Skipping file save.");
      } else {
        const chunkPath = path.join(tempDir, `chunk_${++chunkIndex}.wav`);
        fs.writeFileSync(chunkPath, Buffer.from(chunkBuffer));
        console.log(`Saved final combined chunk ${chunkIndex} to ${chunkPath}`);
      }
    } catch (error) {
      console.error("Failed to save final combined chunk:", error);
    }
  }



  console.log('Audio splitting complete.');
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

        const fs = require('fs');
        const path = require('path');

        const date = new Date().toLocaleDateString('en-US').replace(/\//g, '-');
        const dirPath = path.join(__dirname, 'resources', date);
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
    const path = require('path');

    const date = new Date().toLocaleDateString('en-US').replace(/\//g, '-');
    const dirPath = path.join(__dirname, 'resources', date);
    const filePath = path.join(dirPath, 'New Recording 2.wav');
    splitAudio(filePath, dirPath).then((tempDir) => {
      console.log(`Chunks saved in: ${tempDir}`);
    });
  }
});
