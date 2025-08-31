// Import required modules
import { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } from "discord.js";
import { DisTube } from "distube";
import { YtDlpPlugin } from "@distube/yt-dlp";
import dotenv from "dotenv";
import process from "node:process";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg"; // Import ffmpeg installer

// Load environment variables
dotenv.config();

// Set ffmpeg path (you can set this manually if required)
process.env.FFMPEG_PATH = '/nix/store/qi3dw2dz3gy5gz1mzlw7vm4r3fvla851-ffmpeg-full-7.1-bin/bin/ffmpeg';

// --- Initialize the Client ---
const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages
  ]
});

// --- Initialize DisTube for Music Management ---
const musicPlayer = new DisTube(discordClient, {
  leaveOnStop: true,
  emitNewSongOnly: true,
  plugins: [new YtDlpPlugin()],
  ffmpeg: process.env.FFMPEG_PATH  // Pass the ffmpeg path
});

// --- Bot Presence / Status Update ---
discordClient.once("clientReady", () => {
  console.log(`✅ Bot logged in as ${discordClient.user.tag}`);
  discordClient.user.setPresence({
    activities: [{ name: "🎶 Cursed Brothers Music", type: 2 }], // type 2 = Listening
    status: "online"
  });
});

// --- Register Slash Commands ---
const botCommands = [
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play a song by name or URL")
    .addStringOption(option =>
      option.setName("query").setDescription("Song name or URL").setRequired(true)
    ),
  new SlashCommandBuilder().setName("skip").setDescription("Skip current song"),
  new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Stop the music and clear queue"),
  new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Show the current queue"),
  new SlashCommandBuilder()
    .setName("pause")
    .setDescription("Pause the current song"),
  new SlashCommandBuilder()
    .setName("resume")
    .setDescription("Resume the paused song"),
  new SlashCommandBuilder()
    .setName("volume")
    .setDescription("Set volume level")
    .addIntegerOption(option =>
      option.setName("percent").setDescription("Volume (1-100)").setRequired(true)
    )
].map(command => command.toJSON());

// --- Deploy Slash Commands to Discord ---
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: botCommands }
    );
    console.log("✅ Slash commands registered successfully!");
  } catch (error) {
    console.error("❌ Failed to register commands:", error);
  }
})();

// --- Handle Slash Commands Interactions ---
discordClient.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // Play command: Play song by query or URL
  if (commandName === "play") {
    const query = interaction.options.getString("query");
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) return interaction.reply("❌ Please join a voice channel first.");

    try {
      await interaction.deferReply();  // Prevent timeout while playing song
      musicPlayer.play(voiceChannel, query, {
        textChannel: interaction.channel,
        member: interaction.member
      });

      interaction.followUp(`🎶 Now playing: **${query}**`);  // Send confirmation
    } catch (error) {
      console.error("Error in play command:", error);
      interaction.followUp("❌ An error occurred while trying to play the song.");
    }
  }

  // Skip command: Skip the current song in the queue
  if (commandName === "skip") {
    const queue = musicPlayer.getQueue(interaction);
    if (!queue) return interaction.reply("❌ The queue is empty.");

    try {
      await queue.skip();
      interaction.reply("⏭️ Skipped the current song!");
    } catch (error) {
      console.error("Error skipping song:", error);
      interaction.reply("❌ Could not skip the song.");
    }
  }

  // Stop command: Stop the music and clear the queue
  if (commandName === "stop") {
    const queue = musicPlayer.getQueue(interaction);
    if (!queue) return interaction.reply("❌ No music is currently playing.");

    try {
      queue.stop();
      interaction.reply("⏹️ Music stopped and queue cleared!");
    } catch (error) {
      console.error("Error stopping music:", error);
      interaction.reply("❌ Could not stop the music.");
    }
  }

  // Queue command: Show the current song queue
  if (commandName === "queue") {
    const queue = musicPlayer.getQueue(interaction);
    if (!queue) return interaction.reply("❌ The queue is empty.");

    try {
      interaction.reply(
        `📜 **Current Queue:**\n${queue.songs
          .map((song, index) => `${index === 0 ? "▶️" : `${index}.`} ${song.name} - ${song.formattedDuration}`)
          .join("\n")}`
      );
    } catch (error) {
      console.error("Error retrieving queue:", error);
      interaction.reply("❌ Could not fetch the queue.");
    }
  }

  // Pause command: Pause the current song
  if (commandName === "pause") {
    const queue = musicPlayer.getQueue(interaction);
    if (!queue) return interaction.reply("❌ The queue is empty.");

    try {
      queue.pause();
      interaction.reply("⏸️ Music paused!");
    } catch (error) {
      console.error("Error pausing song:", error);
      interaction.reply("❌ Could not pause the song.");
    }
  }

  // Resume command: Resume the paused song
  if (commandName === "resume") {
    const queue = musicPlayer.getQueue(interaction);
    if (!queue) return interaction.reply("❌ The queue is empty.");

    try {
      queue.resume();
      interaction.reply("▶️ Music resumed!");
    } catch (error) {
      console.error("Error resuming song:", error);
      interaction.reply("❌ Could not resume the song.");
    }
  }

  // Volume command: Set the volume level
  if (commandName === "volume") {
    const percent = interaction.options.getInteger("percent");
    if (percent < 1 || percent > 100) return interaction.reply("❌ Volume must be between 1 and 100.");
    const queue = musicPlayer.getQueue(interaction);
    if (!queue) return interaction.reply("❌ The queue is empty.");

    try {
      queue.setVolume(percent);
      interaction.reply(`🔊 Volume set to **${percent}%**`);
    } catch (error) {
      console.error("Error setting volume:", error);
      interaction.reply("❌ Could not set the volume.");
    }
  }
});

// --- DisTube Event Handlers ---
musicPlayer
  .on("playSong", (queue, song) => {
    queue.textChannel?.send(
      `▶️ Now playing: **${song.name}** - ${song.formattedDuration}`
    );
  })
  .on("addSong", (queue, song) => {
    queue.textChannel?.send(`➕ Added: **${song.name}**`);
  })
  .on("error", (channel, error) => {
    channel?.send("⚠️ Error: " + error.message.slice(0, 200));
  });

// --- Bot Login ---
discordClient.login(process.env.DISCORD_TOKEN);
