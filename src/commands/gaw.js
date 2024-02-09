import { Command } from '@sapphire/framework';
import { readdir, readFile } from 'node:fs';

export class GawCommand extends Command {
  constructor(context, options) {
    super(context, {
      ...options,
      name: 'spaghet',
      description: 'Spaghet'
    });
  }

  registerApplicationCommands(registry) {
    registry.registerChatInputCommand((builder) =>
      builder.setName('spaghet').setDescription('Spaghet')
    );
  }

  async chatInputRun(interaction) {
    console.log('test');
    readdir('images/gaw', function(err, files) {
      console.log(err);
      const gawFilename = files[Math.floor(Math.random()*files.length)];
      interaction.reply({
        files: ['images/gaw/'+gawFilename]
      });

    });

  }
}
