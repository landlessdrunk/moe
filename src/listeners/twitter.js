// import { Listener } from '@sapphire/framework';
// import { Events } from 'discord.js';

// export class TwitterListener extends Listener {
//   constructor(context, options) {
//     super(context, {
//       ...options,
//       event: Events.MessageCreate
//     });
//   }

//   async run(message) {
//     if (message.author.bot) return;

//     const urlPattern = /https?:\/\/(www\.)?(twitter\.com|x\.com)\/\S+/gi;
//     const matches = message.content.match(urlPattern);
//     if (!matches) return;

//     const vxLinks = matches.map(link => {
//       const url = new URL(link);
//       return new URL(url.pathname, 'https://fixupx.com').toString();
//     });

//     message.reply({ content: vxLinks.join('\n') });
//   }
// }
