const { SapphireClient } = require('@sapphire/framework');
const { GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const client = new SapphireClient({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    loadMessageCommandListeners: true
});

client.login(process.env.BOT_TOKEN);