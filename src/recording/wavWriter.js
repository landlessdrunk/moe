import { createWriteStream } from 'node:fs';
import { open } from 'node:fs/promises';

// Writes 16-bit PCM to a WAV file. Header is rewritten on finalize()
// so the file can be streamed to without knowing the final size upfront.
export class WavWriter {
  constructor(filepath, sampleRate = 48000, channels = 2) {
    this.filepath = filepath;
    this.sampleRate = sampleRate;
    this.channels = channels;
    this.dataBytes = 0;
    this.stream = createWriteStream(filepath);
    this.stream.write(Buffer.alloc(44)); // placeholder header
  }

  write(chunk) {
    this.dataBytes += chunk.length;
    this.stream.write(chunk);
  }

  finalize() {
    return new Promise((resolve, reject) => {
      this.stream.end(async () => {
        try {
          const fh = await open(this.filepath, 'r+');
          await fh.write(buildHeader(this.dataBytes, this.sampleRate, this.channels), 0, 44, 0);
          await fh.close();
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  }
}

function buildHeader(dataBytes, sampleRate, channels) {
  const h = Buffer.alloc(44);
  const byteRate = sampleRate * channels * 2;
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + dataBytes, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);       // PCM
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(byteRate, 28);
  h.writeUInt16LE(channels * 2, 32);
  h.writeUInt16LE(16, 34);      // bit depth
  h.write('data', 36);
  h.writeUInt32LE(dataBytes, 40);
  return h;
}
