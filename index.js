const Discord = require('discord.js');

console.log('salut', process.env)

const client = new Discord.Client();

client.login(process.env.DISCORD_BOT_TOKEN);