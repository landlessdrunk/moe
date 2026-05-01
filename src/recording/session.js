import { EndBehaviorType } from '@discordjs/voice';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import OpusScript from 'opusscript';
import { WavWriter } from './wavWriter.js';

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
    this.users = new Map(); // userId -> { writer, decoder, lastAudioTime, filepath, opusStream }
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

    // Subscribe to everyone already in the channel
    for (const [memberId, member] of this.voiceChannel.members) {
      if (member.user.bot) continue;
      this._subscribe(memberId, receiver);
    }

    // Pick up anyone not yet subscribed when they start speaking
    receiver.speaking.on('start', (userId) => {
      if (!this.recording || this.users.has(userId)) return;
      this._subscribe(userId, receiver);
    });
  }

  _subscribe(userId, receiver) {
    const member = this.voiceChannel.members.get(userId);
    const username = (member?.user.username ?? userId).replace(/[^a-z0-9_-]/gi, '_');
    const filepath = join(this.outputDir, `${username}_${userId}_${this.startTime}.wav`);

    const writer = new WavWriter(filepath, SAMPLE_RATE, CHANNELS);
    writer.write(silenceFor(Date.now() - this.startTime));

    // One decoder per user — opusscript is stateful
    const decoder = new OpusScript(SAMPLE_RATE, CHANNELS, OpusScript.Application.AUDIO);

    const u = { writer, decoder, lastAudioTime: null, filepath, opusStream: null };
    this.users.set(userId, u);
    this.outputFiles.push(filepath);

    const opusStream = receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.Manual },
    });
    opusStream.on('error', () => {}); // suppress destroy-related errors

    opusStream.on('data', (packet) => {
      try {
        const pcm = Buffer.from(decoder.decode(packet));
        const now = Date.now();
        if (u.lastAudioTime !== null) {
          const gap = now - u.lastAudioTime - FRAME_MS;
          if (gap > FRAME_MS) writer.write(silenceFor(gap));
        }
        writer.write(pcm);
        u.lastAudioTime = now;
      } catch (err) {
        console.error(`Decode error for ${userId}:`, err.message);
      }
    });

    u.opusStream = opusStream;
  }

  async stopRecording() {
    this.recording = false;
    for (const u of this.users.values()) u.opusStream?.destroy();
    await new Promise((r) => setTimeout(r, 300));
    await Promise.all([...this.users.values()].map((u) => u.writer.finalize()));
    return this.outputFiles;
  }
}
