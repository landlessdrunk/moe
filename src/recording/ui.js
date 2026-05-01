import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export function buildControlPanel(state) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('record_start')
      .setLabel('Start Recording')
      .setStyle(ButtonStyle.Success)
      .setDisabled(state !== 'idle'),
    new ButtonBuilder()
      .setCustomId('record_stop')
      .setLabel('Stop Recording')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(state !== 'recording'),
    new ButtonBuilder()
      .setCustomId('record_leave')
      .setLabel('Leave')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(state === 'recording'),
  );

  const label = {
    idle: 'Joined. Ready to record.',
    recording: ':red_circle: Recording…',
    processing: 'Processing recording…',
  }[state] ?? state;

  return { content: label, components: [row] };
}
