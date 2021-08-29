
import * as dotenv from 'dotenv';
dotenv.config();
import { Client, Message, Snowflake, GuildMember, Interaction } from "discord.js";
import { Track } from './track';
import { MusicSubscription } from './subscription';
import { AudioPlayerStatus, entersState, joinVoiceChannel, AudioResource, VoiceConnectionStatus } from "@discordjs/voice";


const { DISCORD_BOT_TOKEN: token, DISCORD_BOT_PREFIX: prefix } = process.env;

const client = new Client({ intents: ["GUILDS", "GUILD_MESSAGES", "GUILD_VOICE_STATES"] });
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
client.on('messageCreate', async (msg: Message) => {
    if (!msg.guild) return
    if (!client.application?.owner) await client.application?.fetch();

    if (msg.content.toLowerCase() === '!start' && msg.author.id === client.application?.owner?.id) {
        await msg.guild.commands.set([
            {
                name: 'play',
                description: 'Plays a song',
                options: [
                    {
                        name: 'song',
                        type: 'STRING' as const,
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
        await msg.reply('Deployed.')
    }
});

const subscriptions = new Map<Snowflake, MusicSubscription>();

client.on('interactionCreate', async (interaction: Interaction) => {
    if (!interaction.isCommand() || !interaction.guildId) return;
    let subscription = subscriptions.get(interaction.guildId);
    switch (interaction.commandName) {
        case 'play':
            await interaction.deferReply();
            const url = interaction.options.get('song')!.value! as string;
            if (!subscription) {
                if (interaction.member instanceof GuildMember && interaction.member.voice.channel) {
                    const channel = interaction.member.voice.channel;
                    subscription = new MusicSubscription(
                        joinVoiceChannel({
                            channelId: channel.id,
                            guildId: channel.guild.id,
                            adapterCreator: channel.guild.voiceAdapterCreator,
                        }),
                    )
                    subscription.voiceConnection.on('error', console.warn);
                    subscriptions.set(interaction.guildId, subscription);
                }
            }

            if (!subscription) {
                await interaction.followUp('Join a voice channel and try that again');
                return;
            }

            try {
                await entersState(subscription.voiceConnection, VoiceConnectionStatus.Ready, 20e3);
            } catch (error) {
                console.warn(error);
                await interaction.followUp('Failed to join voice channel, please try again.');
                return;
            }

            try {
                const track = await Track.from(url, {
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
            } catch (error) {
                console.warn(error);
                await interaction.reply('Failed to play track, please try again');
            }
            break;
        case 'skip':
            if (subscription) {
                subscription.audioPlayer.stop();
                await interaction.reply('Skipped song');
            } else {
                await interaction.reply('Not playing.');
            };
            break;
        case 'queue':
            if (subscription) {
                const current = subscription.audioPlayer.state.status === AudioPlayerStatus.Idle ? 'Nothing is playing.' : `Playing **${(subscription.audioPlayer.state.resource as AudioResource<Track>).metadata.title}**`;
                const queue = subscription.queue.slice(0, 5).map((track, index) => `${index + 1}) ${track.title}`).join('\n');
                await interaction.reply(`${current}\n\n${queue}`)
            } else {
                await interaction.reply('Not playing.');
            };
            break;
        case 'pause':
            if (subscription) {
                subscription.audioPlayer.pause();
                await interaction.reply({ content: 'Paused.', ephemeral: true });
            } else {
                await interaction.reply('Not playing.');
            };
            break;
        case 'resume':
            if (subscription) {
                subscription.audioPlayer.unpause();
                await interaction.reply({ content: 'Unpaused', ephemeral: true });
            } else {
                await interaction.reply('Not playing.');
            };
            break;
        case 'stop':
            if (subscription) {
                subscription.voiceConnection.destroy();
                subscriptions.delete(interaction.guildId);
                await interaction.reply({ content: 'Left channel.', ephemeral: true });
            } else {
                await interaction.reply('Not playing.');
            };
            break;
        default:
            await interaction.reply('Unknown command.');
            break;
    }
})

client.on('error', console.warn);

console.log('token', token);
void client.login(token);