import { EndBehaviorType } from '@discordjs/voice';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import prism from 'prism-media';
import { WavWriter } from './wavWriter.js';

const SAMPLE_RATE = 48000;
const CHANNELS = 2;
const FRAME_MS = 20; // one Opus frame
const RECORDINGS_BASE = process.env.RECORDINGS_DIR ?? 'recordings';

function silenceFor(ms) {
  const bytes = Math.max(0, Math.floor((ms / 1000) * SAMPLE_RATE * CHANNELS * 2));
  return Buffer.alloc(bytes);
}

export class RecordingSession {
  constructor(connection, voiceChannel) {
    this.connection = connection;
    this.voiceChannel = voiceChannel;
    this.recording = false;
    // userId -> { writer, lastAudioTime, opusStream, decoder, filepath }
    this.users = new Map();
    this.outputFiles = [];
    this.outputDir = null;
    this.startTime = null;
  }

  async startRecording() {
    this.startTime = Date.now();
    this.outputDir = join(RECORDINGS_BASE, `${this.voiceChannel.guild.id}_${this.startTime}`);
    await mkdir(this.outputDir, { recursive: true });
    this.recording = true;

    const receiver = this.connection.receiver;

    // Subscribe to everyone already present so we don't miss audio
    // if speaking.start fires before or instead of after we set up the listener
    for (const [memberId, member] of this.voiceChannel.members) {
      if (member.user.bot) continue;
      this._subscribe(memberId, receiver);
    }

    // Pick up anyone who joins or wasn't caught above
    receiver.speaking.on('start', (userId) => {
      if (!this.recording || this.users.has(userId)) return;
      this._subscribe(userId, receiver);
    });
  }

  _subscribe(userId, receiver) {
    const member = this.voiceChannel.members.get(userId);
    const username = (member?.user.username ?? userId).replace(/[^a-z0-9_-]/gi, '_');
    const filepath = join(this.outputDir, `${username}_${userId}.wav`);

    const writer = new WavWriter(filepath, SAMPLE_RATE, CHANNELS);
    // Pad silence so this track starts at the recording origin
    writer.write(silenceFor(Date.now() - this.startTime));

    const u = { writer, lastAudioTime: null, filepath };
    this.users.set(userId, u);
    this.outputFiles.push(filepath);

    // Manual mode: stream stays open for the full recording duration
    const opusStream = receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.Manual },
    });
    const decoder = new prism.opus.Decoder({ rate: SAMPLE_RATE, channels: CHANNELS, frameSize: 960 });

    decoder.on('data', (chunk) => {
      const now = Date.now();
      // Fill wall-clock gaps (silence between utterances) so the track stays in sync
      if (u.lastAudioTime !== null) {
        const gap = now - u.lastAudioTime - FRAME_MS;
        if (gap > FRAME_MS) writer.write(silenceFor(gap));
      }
      writer.write(chunk);
      u.lastAudioTime = now;
    });

    opusStream.pipe(decoder);
    opusStream.on('close', () => decoder.destroy());

    u.opusStream = opusStream;
    u.decoder = decoder;
  }

  async stopRecording() {
    this.recording = false;
    for (const u of this.users.values()) u.opusStream?.destroy();
    // Let buffered PCM drain
    await new Promise((r) => setTimeout(r, 300));
    await Promise.all([...this.users.values()].map((u) => u.writer.finalize()));
    return this.outputFiles;
  }
}
