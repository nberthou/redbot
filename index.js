const Discord = require('discord.js');
const ytdl = require('ytdl-core');
const ytpl = require('ytpl');

const client = new Discord.Client();
const prefix = process.env.DISCORD_BOT_PREFIX;
const queue = new Map();


const execute = async (message, serverQueue) => {
    const args = message.content.split(' ');
    args.shift();
    
    const voiceChannel = message.member.voice.channel;

    if (!voiceChannel) {
        return message.channel.send('You must be in a voice channel to play music!');
    }
    const permissions = voiceChannel.permissionsFor(message.client.user);
    if (!permissions.has('CONNECT') || !permissions.has('SPEAK')) {
        return message.channel.send('I need the permissions to join and speak in your voice channel !')
    }

    if (args[0].includes('playlist?list=')) {
        ytpl(args[0]).then(pl => {
            console.log('pl', pl);
        })
    } else {
        const songInfo = await ytdl.getInfo(args[0]);
        const song = {
            title: songInfo.videoDetails.title,
            url: songInfo.videoDetails.video_url,
        }
    
        if (!serverQueue) {
            const queueContract = {
                textChannel: message.channel,
                voiceChannel,
                connection: null,
                songs: [],
                volume: 5,
                playing: true
            }
            queue.set(message.guild.id, queueContract);
            queueContract.songs.push(song);
    
            try {
                var connection = await voiceChannel.join();
                queueContract.connection = connection;
                play(message.guild, queueContract.songs[0])
            } catch (err) {
                console.error(err);
                queue.delete(message.guild.id);
                return message.channel.send(err);
            }
    
        } else {
            serverQueue.songs.push(song);
            console.log(serverQueue.songs);
            return message.channel.send(`${song.title} has been added to the queue`)
        }
    }
}

const skip = (message, serverQueue) => {
    if (!message.member.voice.channel) {
        return message.channel.send('You must be in a voice channel to stop music!');
    }
    if (!serverQueue) {
        return message.channel.send('There is no song to skip !');
    }
    serverQueue.connection.dispatcher.end();
}

function stop(message, serverQueue) {
    if (!message.member.voice.channel)
      return message.channel.send(
        "You have to be in a voice channel to stop the music!"
      );
    if (!serverQueue) {
        return message.channel.send('There is no song to stop.')
    }  
    serverQueue.songs = [];
    serverQueue.connection.dispatcher.end();
  }

  const play = (guild, song) => {
    const serverQueue = queue.get(guild.id);
    if (!song) {
        serverQueue.voiceChannel.leave();
        queue.delete(guild.id);
        return;
    }

    const dispatcher = serverQueue.connection
    .play(ytdl(song.url))
    .on('finish', () => {
        serverQueue.songs.shift();
        play(guild, serverQueue.songs[0])
    })
    .on('error', err => console.error(err));
    dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);
    serverQueue.textChannel.send(`Start playing: **${song.title}**`);
}

client.on("message", (message) => {
    if(message.author.bot) return;
    if(!message.content.startsWith(prefix)) return;

    const commandBody = message.content.slice(prefix.length);
    const args = commandBody.split(' ');
    const command = args.shift().toLowerCase();
    const serverQueue = queue.get(message.guild.id);

    switch (command) {
        case 'marco':
            const timeTaken = Date.now() - message.createdTimestamp;
            message.channel.send(`POLO ! Latency : \`${timeTaken}ms\``);
            break;
        case 'clear':
            message.channel.bulkDelete((parseInt(args[0], 10) + 1) || 100);
            break; 
        case 'play':
        case 'p':
            execute(message, serverQueue);
            break;
        case 'skip':
        case 'sk':
            skip(message, serverQueue);
            break;
        case 'stop':
        case 'st':
            stop(message, serverQueue);
            }
})

client.login(process.env.DISCORD_BOT_TOKEN);

client.on("ready", () => {
    client.user.setActivity({name: 'up and running'})
})