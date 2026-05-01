import { SapphireClient } from '@sapphire/framework';
import { GatewayIntentBits } from 'discord.js';
import express from 'express';
import { join } from 'node:path';
import 'dotenv/config';

const client = new SapphireClient({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.MessageContent,
    ],
    loadMessageCommandListeners: true
});

if (process.env.DOWNLOAD_BASE_URL) {
  const app = express();
  const recordingsDir = join(process.cwd(), process.env.RECORDINGS_DIR ?? 'recordings');
  app.use('/recordings', express.static(recordingsDir));
  const port = process.env.DOWNLOAD_PORT ?? 3000;
  app.listen(port, () => console.log(`Download server on port ${port}`));
}

client.login(process.env.BOT_TOKEN);
