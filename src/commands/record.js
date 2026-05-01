import { Command } from '@sapphire/framework';
import { ChannelType } from 'discord.js';
import { createSocket } from 'node:dgram';
import { joinVoiceChannel, VoiceConnectionStatus, entersState } from '@discordjs/voice';
import { buildControlPanel } from '../recording/ui.js';
import { getSession, setSession } from '../recording/state.js';
import { RecordingSession } from '../recording/session.js';

function testUdp() {
  return new Promise((resolve) => {
    const sock = createSocket('udp4');
    sock.on('error', (err) => { sock.close(); resolve(`fail: ${err.message}`); });
    sock.bind(0, () => { const { port } = sock.address(); sock.close(); resolve(`ok (port ${port})`); });
  });
}

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
      debug: true,
    });

    const states = [connection.state.status];
    const debugLines = [];
    connection.on('stateChange', (_, next) => states.push(next.status));
    connection.on('debug', (msg) => { debugLines.push(msg); console.log('[voice]', msg); });
    connection.on('error', (err) => { debugLines.push(`ERROR: ${err.message}`); console.error('[voice error]', err); });

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
    } catch {
      connection.destroy();
      const udp = await testUdp();
      const debugSummary = debugLines.length ? '\n```\n' + debugLines.slice(-20).join('\n') + '\n```' : '';
      return interaction.editReply({
        content: `Failed to connect to voice channel.\nStates: \`${states.join(' → ')}\`\nUDP: \`${udp}\`${debugSummary}`,
      });
    }

    setSession(interaction.guildId, new RecordingSession(connection, channel));
    await interaction.editReply(buildControlPanel('idle'));
  }
}
