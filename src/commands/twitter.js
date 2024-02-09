import { Command } from '@sapphire/framework';

export class TwitterCommand extends Command {
  constructor(context, options) {
    super(context, {
      ...options,
      name: 'x',
      description: 'Expand twitter links automatically'
    });
  }

  registerApplicationCommands(registry) {
    registry.registerChatInputCommand((builder) =>
      builder.setName('x').setDescription('Convert x/twitter link to vxtwitter.').addStringOption((option) =>
        option.setName('link').setDescription('Twitter or X link').setRequired(true)
      )
    );
  }

  async chatInputRun(interaction) {
    const rawLink = interaction.options.getString('link');
    if (!URL.canParse(rawLink)) {
    } else {
      const twitterLink = new URL(rawLink)
      if (['x.com', 'twitter.com'].includes(twitterLink.host)) {
        var vxLink = new URL(twitterLink.pathname, 'https://vxtwitter.com')
        interaction.reply({
          content: vxLink.toString()
        });
      }
    }
  }
}
