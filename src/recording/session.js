import { EndBehaviorType } from '@discordjs/voice';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { WavWriter } from './wavWriter.js';

const OpusScript = createRequire(import.meta.url)('opusscript');

const SAMPLE_RATE = 48000;
const CHANNELS = 2;
const FRAME_MS = 20;
const RECORDINGS_BASE = process.env.RECORDINGS_DIR ?? 'recordings';

function silenceFor(ms) {
  return Buffer.alloc(Math.max(0, Math.floor((ms / 1000) * SAMPLE_RATE * CHANNELS * 2)));
}

export class RecordingSession {
  constructor(connection, voiceChannel) {
    this.connection = connection;
    this.voiceChannel = voiceChannel;
    this.recording = false;
    this.users = new Map();
    this.outputFiles = [];
    this.outputDir = null;
    this.startTime = null;
    this.speakingEvents = 0;
  }

  async startRecording() {
    this.startTime = Date.now();
    this.outputDir = join(RECORDINGS_BASE, `${this.voiceChannel.guild.id}_${this.startTime}`);
    await mkdir(this.outputDir, { recursive: true });
    this.recording = true;

    const receiver = this.connection.receiver;

    // Only subscribe inside speaking.on('start') — at this point Discord has already
    // sent the SSRC for this user, so the receiver can actually route packets to the stream.
    receiver.speaking.on('start', (userId) => {
      if (!this.recording) return;
      this.speakingEvents++;

      const u = this.users.get(userId);
      if (u?.opusStream && !u.opusStream.destroyed) return; // already has a live stream
      this._subscribe(userId, receiver);
    });
  }

  _subscribe(userId, receiver) {
    const member = this.voiceChannel.members.get(userId);
    const username = (member?.user.username ?? userId).replace(/[^a-z0-9_-]/gi, '_');

    let u = this.users.get(userId);
    if (!u) {
      const filepath = join(this.outputDir, `${username}_${userId}_${this.startTime}.wav`);
      const writer = new WavWriter(filepath, SAMPLE_RATE, CHANNELS);
      writer.write(silenceFor(Date.now() - this.startTime));
      u = { writer, opusStream: null, lastAudioTime: null, filepath, packets: 0, decodeErrors: 0 };
      this.users.set(userId, u);
      this.outputFiles.push(filepath);
    } else if (u.lastAudioTime !== null) {
      // Fill the silence gap since this user last spoke
      u.writer.write(silenceFor(Date.now() - u.lastAudioTime));
    }

    const decoder = new OpusScript(SAMPLE_RATE, CHANNELS, OpusScript.Application.AUDIO);

    const opusStream = receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.AfterSilence, duration: 500 },
    });
    opusStream.on('error', () => {});

    opusStream.on('data', (packet) => {
      u.packets++;
      try {
        const pcm = Buffer.from(decoder.decode(packet));
        const now = Date.now();
        if (u.lastAudioTime !== null) {
          const gap = now - u.lastAudioTime - FRAME_MS;
          if (gap > FRAME_MS) u.writer.write(silenceFor(gap));
        }
        u.writer.write(pcm);
        u.lastAudioTime = now;
      } catch (err) {
        u.decodeErrors++;
      }
    });

    opusStream.on('close', () => {
      decoder.delete?.();
      u.opusStream = null; // allow re-subscription on next speaking event
    });

    u.opusStream = opusStream;
  }

  async stopRecording() {
    this.recording = false;
    for (const u of this.users.values()) u.opusStream?.destroy();
    await new Promise((r) => setTimeout(r, 300));
    await Promise.all([...this.users.values()].map((u) => u.writer.finalize()));

    const stats = [`speaking events: ${this.speakingEvents}`, ...[...this.users.entries()].map(([userId, u]) => {
      const name = this.voiceChannel.members.get(userId)?.user.username ?? userId;
      return `${name}: ${u.packets} packets, ${u.decodeErrors} errors, ${u.writer.dataBytes} bytes`;
    })];

    return { files: this.outputFiles, stats };
  }
}
