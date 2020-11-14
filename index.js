const Discord = require('discord.js');
const ytdl = require('ytdl-core');
const client = new Discord.Client();

const prefix = process.env.DISCORD_BOT_PREFIX;
const queue = new Map();


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
        guild.serverQueue.songs && play(guild.serverQueue.songs[0])
    })
    .on('error', err => console.error(error));
    dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);
    serverQueue.textChannel.send(`Start playing: **${song.title}**`);
}

const execute = async (message, serverQueue) => {
    const args = message.content.slice(prefix.length).split(' ');
    args.shift();

    const voiceChannel = message.member.voice.channel;

    if (!voiceChannel) {
        return message.channel.send('You must be in a voice channel to play music!');
    }
    const permissions = voiceChannel.permissionsFor(message.client.user);
    if (!permissions.has('CONNECT') || !permissions.has('SPEAK')) {
        return message.channel.send('I need the permissions to join and speak in your voice channel !')
    }
    const songInfo = await ytdl.getInfo(args[1]);
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

client.on("message", (message) => {
    if(message.author.bot) return;
    if(!message.content.startsWith(prefix)) return;

    const commandBody = message.content.slice(prefix.length);
    const args = commandBody.split(' ');
    const command = args.shift().toLowerCase();

    switch (command) {
        case 'marco':
            const timeTaken = Date.now() - message.createdTimestamp;
            message.channel.send(`POLO ! Latency : \`${timeTaken / 10}ms\``);
            break;
        case 'clear':
            message.channel.bulkDelete((parseInt(args[0], 10) + 1) || 100);
            break; 
        case 'music':
            console.debug('index l.50 queue', queue);
            const serverQueue = queue.get(message.guild.id);
            switch (args[0]) {
                case 'play':
                    execute(message, serverQueue);
                    break;
            }
    }

})

client.login(process.env.DISCORD_BOT_TOKEN);

client.on("ready", () => {
    client.user.setActivity({name: 'up and running'})
})