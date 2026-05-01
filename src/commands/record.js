import { Command } from '@sapphire/framework';
import { ChannelType } from 'discord.js';
import { joinVoiceChannel, VoiceConnectionStatus, entersState } from '@discordjs/voice';
import { buildControlPanel } from '../recording/ui.js';
import { getSession, setSession } from '../recording/state.js';
import { RecordingSession } from '../recording/session.js';

export class RecordCommand extends Command {
  constructor(context, options) {
    super(context, { ...options, name: 'join', description: 'Join a voice channel for recording' });
  }

  registerApplicationCommands(registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName('join')
        .setDescription('Join a voice channel for recording')
        .addChannelOption((o) =>
          o.setName('channel').setDescription('Voice channel to join').addChannelTypes(ChannelType.GuildVoice).setRequired(true)
        )
    );
  }

  async chatInputRun(interaction) {
    if (getSession(interaction.guildId)) {
      return interaction.reply({ content: 'Already active in this server.', ephemeral: true });
    }

    await interaction.deferReply();

    const channel = interaction.options.getChannel('channel');
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: interaction.guildId,
      adapterCreator: interaction.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: true,
    });

    const states = [connection.state.status];
    const debugLogs = [];
    connection.on('stateChange', (_, next) => {
      const detail = next.status === 'disconnected' ? `(code ${next.closeCode ?? next.reason ?? '?'})` : '';
      states.push(next.status + detail);
    });
    connection.on('debug', (msg) => debugLogs.push(msg));

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
    } catch {
      connection.destroy();
      const log = debugLogs.slice(-8).join('\n');
      return interaction.editReply({
        content: `Failed to connect to voice channel.\nStates: ${states.join(' → ')}\n\`\`\`\n${log}\n\`\`\``,
      });
    }

    setSession(interaction.guildId, new RecordingSession(connection, channel));
    await interaction.editReply(buildControlPanel('idle'));
  }
}
