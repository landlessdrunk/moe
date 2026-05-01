import { Listener } from '@sapphire/framework';
import { Events } from 'discord.js';
import { getVoiceConnection } from '@discordjs/voice';
import { createWriteStream, statSync } from 'node:fs';
import archiver from 'archiver';
import { buildControlPanel } from '../recording/ui.js';
import { getSession, deleteSession } from '../recording/state.js';

const BUTTON_IDS = new Set(['record_start', 'record_stop', 'record_leave']);
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export class RecordButtonListener extends Listener {
  constructor(context, options) {
    super(context, { ...options, event: Events.InteractionCreate });
  }

  async run(interaction) {
    if (!interaction.isButton() || !BUTTON_IDS.has(interaction.customId)) return;

    const session = getSession(interaction.guildId);
    if (!session) return interaction.reply({ content: 'No active session.', ephemeral: true });

    if (interaction.customId === 'record_start') {
      await interaction.deferUpdate();
      try {
        await session.startRecording();
        await interaction.editReply(buildControlPanel('recording'));
      } catch (err) {
        console.error('startRecording failed:', err);
        await interaction.editReply({ content: `Failed to start recording: ${err.message}`, components: [] });
      }
    } else if (interaction.customId === 'record_stop') {
      await interaction.update(buildControlPanel('processing'));
      const { files, stats } = await session.stopRecording();
      await this._deliver(interaction, files, stats, session);
      session.reset();
      await interaction.editReply(buildControlPanel('idle'));
    } else if (interaction.customId === 'record_leave') {
      getVoiceConnection(interaction.guildId)?.destroy();
      deleteSession(interaction.guildId);
      await interaction.update({ content: 'Left voice channel.', components: [] });
    }
  }

  async _deliver(interaction, files, stats, session) {
    const diagnostics = stats.length ? '\n```\n' + stats.join('\n') + '\n```' : '';

    if (files.length === 0) {
      await interaction.followUp({ content: `No audio was recorded.${diagnostics}` });
      return;
    }

    const zipPath = `${session.outputDir}.zip`;
    await zip(files, zipPath);
    const size = statSync(zipPath).size;

    if (size <= MAX_UPLOAD_BYTES) {
      await interaction.followUp({
        content: `Recording complete! ${files.length} track(s).${diagnostics}`,
        files: [zipPath],
      });
      return;
    }

    const baseUrl = process.env.DOWNLOAD_BASE_URL;
    const filename = zipPath.split('/').pop();
    const sizeMB = (size / 1024 / 1024).toFixed(1);

    if (baseUrl) {
      await interaction.followUp({
        content: `Recording complete! ${files.length} track(s) — ${sizeMB} MB\nDownload: ${baseUrl}/recordings/${filename}${diagnostics}`,
      });
    } else {
      await interaction.followUp({
        content: `Recording complete! ${files.length} track(s) — ${sizeMB} MB (too large to upload).${diagnostics}`,
      });
    }
  }
}

function zip(filepaths, outputPath) {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 0 } }); // no compression — audio is already compressed
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    for (const fp of filepaths) archive.file(fp, { name: fp.split('/').pop() });
    archive.finalize();
  });
}
