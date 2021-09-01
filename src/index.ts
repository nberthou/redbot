
import * as dotenv from 'dotenv';
dotenv.config();
import { Client, Message, Snowflake, GuildMember, Interaction } from "discord.js";
import { shuffle } from 'lodash';
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
    if (msg.content.toLowerCase() === '!start') {
        await msg.guild.commands.set([
            {
                name: 'play',
                description: 'Plays a song or a playlist',
                options: [
                    {
                        name: 'url',
                        type: 'STRING' as const,
                        description: 'The URL of the song or the playlist to play',
                        required: true,
                    },
                    {
                        name: 'shuffle',
                        type: 'BOOLEAN' as const,
                        description: 'Shuffles the playlist',
                        required: false,
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
            const url = interaction.options.get('url')!.value! as string;
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
            const isShuffled = interaction.options.get('shuffle')?.value! as boolean ?? false;
            try {
                const track = await Track.from(url, isShuffled, {
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
                if (Array.isArray(track)) {
                    if (isShuffled) {
                        const shuffledTracks: Track[] = shuffle(track);
                        shuffledTracks.map(t => {
                            subscription?.enqueue(t)
                        })
                    } else {
                        track.map(t => {
                            subscription?.enqueue(t);
                        })
                    }
                    await interaction.followUp(`Enqueued **${track.length}** titles`)
                } else {
                    subscription.enqueue(track);
                    await interaction.followUp(`Enqueued **${track.title}**`);
                }
            } catch (error) {
                console.warn(error);
                await interaction.reply('Failed to play track, please try again');
            }
            break;
        case 'skip':
            if (subscription) {
                console.log('subscription.queue', queue);
                subscription.audioPlayer.stop();
                await interaction.reply('Skipped song');
            } else {
                await interaction.reply('Not playing.');
            };
            break;
        case 'queue':
            if (subscription) {
                const current = subscription.audioPlayer.state.status === AudioPlayerStatus.Idle ? 'Nothing is playing.' : `Playing **${(subscription.audioPlayer.state.resource as AudioResource<Track>).metadata.title}**`;
                const queue = subscription.queue.slice(0, 20).map((track, index) => `${index + 1}) ${track.title}`).join('\n');
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

void client.login(token);