"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const discord_js_1 = require("discord.js");
const track_1 = require("./track");
const subscription_1 = require("./subscription");
const voice_1 = require("@discordjs/voice");
const { DISCORD_BOT_TOKEN: token, DISCORD_BOT_PREFIX: prefix } = process.env;
const client = new discord_js_1.Client({ intents: ["GUILDS", "GUILD_MESSAGES", "GUILD_VOICE_STATES"] });
const queue = new Map();
client.once("ready", () => {
    console.log("Ready!");
});
client.once("reconnecting", () => {
    console.log("Reconnecting!");
});
client.once("disconnect", () => {
    console.log("Disconnect!");
});
client.on('messageCreate', async (msg) => {
    var _a, _b, _c, _d;
    if (!msg.guild)
        return;
    if (!((_a = client.application) === null || _a === void 0 ? void 0 : _a.owner))
        await ((_b = client.application) === null || _b === void 0 ? void 0 : _b.fetch());
    if (msg.content.toLowerCase() === '!start' && msg.author.id === ((_d = (_c = client.application) === null || _c === void 0 ? void 0 : _c.owner) === null || _d === void 0 ? void 0 : _d.id)) {
        await msg.guild.commands.set([
            {
                name: 'play',
                description: 'Plays a song',
                options: [
                    {
                        name: 'song',
                        type: 'STRING',
                        description: 'The URL of the song to play',
                        required: true,
                    }
                ]
            },
            {
                name: 'skip',
                description: 'Skip to the next song',
            },
            {
                name: 'queue',
                description: 'Displays the queue',
            },
            {
                name: 'pause',
                description: 'Pauses the song playing',
            },
            {
                name: 'resume',
                description: 'Resumes the current song',
            },
            {
                name: 'stop',
                description: 'Stops the song, empties the queue and leave the channel'
            }
        ]);
        await msg.reply('Deployed.');
    }
});
const subscriptions = new Map();
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand() || !interaction.guildId)
        return;
    let subscription = subscriptions.get(interaction.guildId);
    switch (interaction.commandName) {
        case 'play':
            await interaction.deferReply();
            const url = interaction.options.get('song').value;
            if (!subscription) {
                if (interaction.member instanceof discord_js_1.GuildMember && interaction.member.voice.channel) {
                    const channel = interaction.member.voice.channel;
                    subscription = new subscription_1.MusicSubscription(voice_1.joinVoiceChannel({
                        channelId: channel.id,
                        guildId: channel.guild.id,
                        adapterCreator: channel.guild.voiceAdapterCreator,
                    }));
                    subscription.voiceConnection.on('error', console.warn);
                    subscriptions.set(interaction.guildId, subscription);
                }
            }
            if (!subscription) {
                await interaction.followUp('Join a voice channel and try that again');
                return;
            }
            try {
                await voice_1.entersState(subscription.voiceConnection, voice_1.VoiceConnectionStatus.Ready, 20e3);
            }
            catch (error) {
                console.warn(error);
                await interaction.followUp('Failed to join voice channel, please try again.');
                return;
            }
            try {
                const track = await track_1.Track.from(url, {
                    onStart() {
                        interaction.followUp({ content: 'Now playing', ephemeral: true }).catch(console.warn);
                    },
                    onFinish() {
                        interaction.followUp({ content: 'Now finished', ephemeral: true }).catch(console.warn);
                    },
                    onError(error) {
                        console.warn(error);
                        interaction.followUp({ content: `Error: ${error.message}`, ephemeral: true }).catch(console.warn);
                    }
                });
                subscription.enqueue(track);
                await interaction.followUp(`Enqueued **${track.title}**`);
            }
            catch (error) {
                console.warn(error);
                await interaction.reply('Failed to play track, please try again');
            }
            break;
        case 'skip':
            if (subscription) {
                subscription.audioPlayer.stop();
                await interaction.reply('Skipped song');
            }
            else {
                await interaction.reply('Not playing.');
            }
            ;
            break;
        case 'queue':
            if (subscription) {
                const current = subscription.audioPlayer.state.status === voice_1.AudioPlayerStatus.Idle ? 'Nothing is playing.' : `Playing **${subscription.audioPlayer.state.resource.metadata.title}**`;
                const queue = subscription.queue.slice(0, 5).map((track, index) => `${index + 1}) ${track.title}`).join('\n');
                await interaction.reply(`${current}\n\n${queue}`);
            }
            else {
                await interaction.reply('Not playing.');
            }
            ;
            break;
        case 'pause':
            if (subscription) {
                subscription.audioPlayer.pause();
                await interaction.reply({ content: 'Paused.', ephemeral: true });
            }
            else {
                await interaction.reply('Not playing.');
            }
            ;
            break;
        case 'resume':
            if (subscription) {
                subscription.audioPlayer.unpause();
                await interaction.reply({ content: 'Unpaused', ephemeral: true });
            }
            else {
                await interaction.reply('Not playing.');
            }
            ;
            break;
        case 'stop':
            if (subscription) {
                subscription.voiceConnection.destroy();
                subscriptions.delete(interaction.guildId);
                await interaction.reply({ content: 'Left channel.', ephemeral: true });
            }
            else {
                await interaction.reply('Not playing.');
            }
            ;
            break;
        default:
            await interaction.reply('Unknown command.');
            break;
    }
});
client.on('error', console.warn);
console.log('token', token);
void client.login(token);
//# sourceMappingURL=index.js.map