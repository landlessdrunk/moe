import { EndBehaviorType } from '@discordjs/voice';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import prism from 'prism-media';
import { WavWriter } from './wavWriter.js';

const SAMPLE_RATE = 48000;
const CHANNELS = 2;
const FRAME_SIZE = 960; // 20ms at 48kHz
const RECORDINGS_BASE = process.env.RECORDINGS_DIR ?? 'recordings';

function silenceFor(ms) {
  return Buffer.alloc(Math.max(0, Math.floor((ms / 1000) * SAMPLE_RATE * CHANNELS * 2)));
}

export class RecordingSession {
  constructor(connection, voiceChannel) {
    this.connection = connection;
    this.voiceChannel = voiceChannel;
    this.recording = false;
    // userId -> { writer, lastAudioTime, opusStream, decoder, filepath }
    this.users = new Map();
    this.outputFiles = []; // filepaths in order of first speech
    this.outputDir = null;
    this.startTime = null;
  }

  async startRecording() {
    this.startTime = Date.now();
    this.outputDir = join(RECORDINGS_BASE, `${this.voiceChannel.guild.id}_${this.startTime}`);
    await mkdir(this.outputDir, { recursive: true });
    this.recording = true;

    const receiver = this.connection.receiver;
    receiver.speaking.on('start', (userId) => {
      if (!this.recording) return;
      const u = this.users.get(userId);
      if (u?.opusStream && !u.opusStream.destroyed) return; // already has live stream
      this._subscribe(userId, receiver);
    });
  }

  _subscribe(userId, receiver) {
    const member = this.voiceChannel.members.get(userId);
    const username = (member?.user.username ?? userId).replace(/[^a-z0-9_-]/gi, '_');

    let u = this.users.get(userId);
    if (!u) {
      const filepath = join(this.outputDir, `${username}_${userId}.wav`);
      u = { writer: null, lastAudioTime: null, filepath, opusStream: null, decoder: null };
      this.users.set(userId, u);
      this.outputFiles.push(filepath);
    }

    // Write silence to align this track with the recording timeline
    if (!u.writer) {
      u.writer = new WavWriter(u.filepath, SAMPLE_RATE, CHANNELS);
      u.writer.write(silenceFor(Date.now() - this.startTime));
    } else if (u.lastAudioTime) {
      u.writer.write(silenceFor(Date.now() - u.lastAudioTime));
    }

    const opusStream = receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.AfterSilence, duration: 200 },
    });
    const decoder = new prism.opus.Decoder({ rate: SAMPLE_RATE, channels: CHANNELS, frameSize: FRAME_SIZE });

    decoder.on('data', (chunk) => {
      u.writer.write(chunk);
      u.lastAudioTime = Date.now();
    });

    opusStream.pipe(decoder);
    opusStream.on('close', () => decoder.destroy());

    u.opusStream = opusStream;
    u.decoder = decoder;
  }

  async stopRecording() {
    this.recording = false;
    for (const u of this.users.values()) {
      u.opusStream?.destroy();
    }
    // Brief drain window so any buffered PCM flushes
    await new Promise((r) => setTimeout(r, 300));
    await Promise.all([...this.users.values()].filter((u) => u.writer).map((u) => u.writer.finalize()));
    return this.outputFiles;
  }
}
