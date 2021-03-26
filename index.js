const { Client, MessageEmbed } = require("discord.js");
const { Manager } = require("erela.js");
const Spotify = require("erela.js-spotify");
const { shuffle, clone } = require('lodash');

const client = new Client();
const prefix = process.env.DISCORD_BOT_PREFIX;

client.manager = new Manager({
  nodes: [{
    host: process.env.LAVALINK_SERVER_LINK,
    port: 2333,
    password: process.env.LAVALINK_SERVER_PASSWORD,
    retryDelay: 5000
  }], autoPlay: true,
  plugins: [
    new Spotify({
      clientID: process.env.SPOTIFY_CLIENT_ID,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    }),
  ],
  send(id, payload) {
    const guild = client.guilds.cache.get(id);
    if (guild) guild.shard.send(payload);
  },
})
  .on("nodeConnect", (node) =>
    console.log(`Node ${node.options.identifier} connected`)
  )
  .on("nodeError", (node, err) =>
    console.log(`Node ${node.options.identifier} had an error : ${err.message}`)
  )
  .on("trackStart", (player, track) => {
    const vc = client.channels.cache.get(player.voiceChannel);
    const embed = new MessageEmbed().setTitle('Now playing').setColor('#ff4747').addField(track.author, `[${track.title}](${track.uri})`);
    if (track.requester) {
      embed.setFooter(`Requested by ${track.requester.username}`)
    }
    if (vc.members.size < 2) {
      player.destroy();
      return client.channels.cache.get(player.textChannel).send(`Player has been disconnected.`)
    }
    client.channels.cache
      .get(player.textChannel)
      .send(embed);
  })
  .on("queueEnd", (player) => {
    client.channels.cache.get(player.textChannel).send("Queue has ended.");
  });

client.on("raw", (d) => client.manager.updateVoiceState(d));

const play = async (message, args) => {
  const { channel } = message.member.voice;

  if (!channel) {
    return message.channel.send('You need to join a voice channel !');
  }

  
  const player = message.client.manager.create({
    guild: message.guild.id,
    voiceChannel: channel.id,
    textChannel: message.channel.id,
  });


  if (!args.length) {
    if (!player) {
      return message.channel.send('There is no player found on this server.')
    }

    if (!channel) {
      return message.channel.send('You need to join a voice channel');
    }
    if (channel.id !==  player.voiceChannel) {
      return message.channel.send('You\'re not in the same voice channel');
    }
    if (!player.paused) {
      return message.channel.send('You need to give an URL or a search term');
    }

    player.pause(false);
    return message.channel.send('Resumed the player.');
    
  }

  if (player.state !== 'CONNECTED' && args.length > 0) {
    player.connect();
  }

    const cloneArgs = clone(args);
    if (cloneArgs[0] === '-r') {
      cloneArgs.shift();
    }
    const search = cloneArgs.join(' ');
    let res;

    if( channel.id !==  player.voiceChannel) {
      player.connect();
    }

    try {
      if (search.includes('open.spotify')) {
        res = await player.search(search);
      } else {
        res = await player.search(search, message.author);
      }
      if (res.loadType === 'LOAD_FAILED') {
        if (!player.queue.current) {
          player.destroy();
        }
        throw res.exception;
      }
    } catch (e) {
      return message.channel.send(`There was an error while searching : ${e.message}`);
    }

    switch (res.loadType) {
      case 'NO_MATCHES':
        if (!player.queue.current) {
          player.destroy();
        }
        return message.channel.send('No results found.');
      case 'TRACK_LOADED':
        player.queue.add(res.tracks[0]);
        if (!player.playing && !player.paused && !player.queue.size) {
          player.play();
        }
        return message.channel.send(`Adding to queue: **${res.tracks[0].title}**`);
      case 'PLAYLIST_LOADED':
        if (args[0] === '-r') {
          player.queue.add(shuffle(res.tracks)) 
        } else { 
          player.queue.add(res.tracks);
        }
        if (!player.playing && !player.paused && player.queue.totalSize === res.tracks.length) {
          player.play();
        }
        return message.channel.send(`Adding to queue playlist \`${res.playlist.name}\` with ${res.tracks.length} songs.`);
      case 'SEARCH_RESULT':
        let max = 5;
        let collected;
        let filter = m => m.author.id === message.author.id && /^(\d+|end)$/i.test(m.content);
        if (res.tracks.length < max) {
          max = res.tracks.length
        };
        const results = res.tracks.slice(0, max).map((track, ind) => `${++ind} - \`${track.title}\``).join('\n');
        message.channel.send(results);

        try {
          collected = await message.channel.awaitMessages(filter, { max: 1, time: 30e3, errors: ['time']});
        } catch (e) {
          if (!player.queue.current) {
            player.destroy();
          }
          return message.channel.send("You didn't provide a selection");
        }
        const first = collected.first().content;
        if (first.toLowerCase() === 'end') {
          if (!player.queue.current) {
            player.destroy();
          }
          return message.channel.send('Cancelled selection.');
        }
        const index = Number(first) - 1;
        if (index < 0 || index > max - 1) {
          return message.channel.send(`The number you provided is too small or too big.`);          
        }
        const track = res.tracks[index];

        player.queue.add(track);

        if (!player.playing && !player.paused && !player.queue.size) {
          player.play()
        }
        
        return message.channel.send(`Adding to queue \`${track.title}\``)
    }
}

const skip = message => {
  const player = message.client.manager.get(message.guild.id);
  if (!player) {
    return message.channel.send('There is no player found on this server.')
  }


  const { channel } = message.member.voice;
  if (!channel) {
    return message.channel.send("You need to join a voice channel.")
  }

  if (channel.id !== player.voiceChannel) {
    return message.channel.send("You're not in the same bot channel.");
  }

  if (!player.queue.current) {
    return message.channel.send("There is no music playing.");
  }

  const { title } = player.queue.current;

  player.stop();
  return message.channel.send(`${title} was skipped.`)

};

const stop = message => {
  const player = message.client.manager.get(message.guild.id);
  if (!player) {
    return message.channel.send('There is no player found on this server.')
  }

  const { channel } = message.member.voice;

  if (!channel) {
    return message.channel.send("You need to join a voice channel.");
  }
  if (channel.id !== player.voiceChannel) {
    return message.channel.send("You are not in the same voice channel.")
  }

  player.destroy();
  return message.channel.send("Player disconnected.");
}

const queue = (message, args) => {
  const player = message.client.manager.get(message.guild.id);
  if (!player) {
    return message.channel.send('There is no player found on this server.')
  }

  const queue = player.queue;
  const embed = new MessageEmbed().setTitle(`Queue for ${message.guild.name}`).setColor('#ff4747');

  const multiple = 10;
  const page = args.length && Number(args[0]) ? Number(args[0]) : 1;
  const end = page * multiple;
  const start = end - multiple;

  const tracks = queue.slice(start, end);

  if (queue.current) {
    embed.addField("Current", `[${queue.current.title}](${queue.current.uri})`);
  }

  if (!tracks.length) {
    embed.setDescription(`No tracks in  ${page > 1 ? `page ${page}` : 'the queue'}.`);
  } else {
    embed.setDescription(tracks.map((track, i) => {
      return `${start + (++i)} - [${track.title}](${track.uri})`}).join('\n'));
  }

  const maxPages = Math.ceil(queue.length / multiple);

  embed.setFooter(`Page ${page > maxPages ? maxPages : page} of ${maxPages}`)

  return message.channel.send(embed);
}

const nowPlaying = message => {
  const player = message.client.manager.get(message.guild.id);
  if (!player) {
    return message.channel.send('There is no player found on this server.')
  }

  const { current } = player.queue;
  const embed = new MessageEmbed().setTitle(`Now playing`).setColor('#ff4747');

  if (!current) {
    return message.channel.send('No song playing.');
  } else {
    embed.addField(current.author,`[${current.title}](${current.uri})`).setImage(current.thumbnail)
    if (player.queue[0]) {
      embed.addField('Next song :', `[${player.queue[0].title}](${player.queue[0].uri})`)
    }
    if (current.requester) {
      embed.setFooter(`Requested by ${current.requester.username}`);
    }
    return message.channel.send(embed);
  }
}

const pause = message => {
  const player = message.client.manager.get(message.guild.id);
  if (!player) {
    return message.channel.send('There is no player found on this server.');
  }

  const { channel } = message.member.voice;

  if (!channel) {
    return message.channel.send('You need to join a voice channel');
  }
  if (channel.id !== player.voiceChannel) {
    return message.channel.send('You\'re not in the same voice channel.')
  }
  if (player.paused) {
    return message.channel.send('The player is already paused.')
  }

  player.pause(true);
  return message.channel.send('The player has been paused.')
}

const help = message => {
  const embed = new MessageEmbed().setTitle('Commands for the Redbot').setColor('#ff4747')
  .addField('Music', `
    - **!p** or **!play** [Search term or Youtube / Spotify URL]: If followed by a link, plays music from link. If followed by search term, search a video. Else, resumes the paused music.
    - **!sk** or **!skip** : Skips the current song.
    - **!st** or **!stop** : Stops the queue.
    - **!pp** or **!pause** : Pauses the current song.
    - **!np** or **!nowplaying** : Displays informations about the current song.
    - **!q** or **!queue** : Displays the current queue.
    `).addField('Misc.', `
    - **!clear** or **!cl** : Clear the last 100 messages (if they are younger than 14 days)
    - **!marco** : Answers "POLO !".
    `)

  return message.channel.send(embed);
}

client.on("message", (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(prefix)) return;

  const commandBody = message.content.slice(prefix.length);
  const args = commandBody.split(" ");
  const command = args.shift().toLowerCase();

  switch (command) {
    case "marco":
      const timeTaken = Date.now() - message.createdTimestamp;
      message.channel.send(`POLO ! Latency : \`${timeTaken}ms\``);
      break;
    case "clear":
    case 'cl':
      message.channel.bulkDelete(parseInt(args[0], 10) + 1 || 100);
      break;
    case "play":
    case "p":
      play(message, args);
      break;
    case "skip":
    case "sk":
      skip(message);
      break;
    case "stop":
    case "st":
      stop(message);
      break;
    case "queue":
    case "q":
      queue(message, args);
      break;
    case 'nowplaying':
    case 'np':
      nowPlaying(message);
      break;
    case 'pause':
    case 'pp':
      pause(message);
      break;
    case 'help':
    case 'h':
      help(message);
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);

client.once("ready", () => {
  client.user.setActivity("Azgold", {type: "STREAMING", url: "https://twitch.tv/azgold"});
  client.manager.init(client.user.id);
});
