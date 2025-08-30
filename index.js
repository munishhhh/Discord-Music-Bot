import { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } from "discord.js";
import { DisTube } from "distube";
import { YtDlpPlugin } from "@distube/yt-dlp";
import dotenv from "dotenv";
import process from "node:process";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg"; // Import the ffmpeg installer package

// Load environment variables
dotenv.config();

// Set the ffmpeg path from @ffmpeg-installer/ffmpeg (you can also set it explicitly)
process.env.FFMPEG_PATH = '/nix/store/qi3dw2dz3gy5gz1mzlw7vm4r3fvla851-ffmpeg-full-7.1-bin/bin/ffmpeg';  // Explicitly set the correct path

// --- Client Setup ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages
  ]
});

// --- DisTube Setup ---
const distube = new DisTube(client, {
  leaveOnStop: true,
  emitNewSongOnly: true,
  plugins: [new YtDlpPlugin()],
  ffmpeg: process.env.FFMPEG_PATH  // Pass the correct ffmpeg path from environment variable
});

// --- Presence / RPC ---
client.once("clientReady", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.user.setPresence({
    activities: [{ name: "🎶 Cursed Brothers Music", type: 2 }], // type 2 = Listening
    status: "online"
  });
});

// --- Slash Commands ---
const commands = [
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play a song by name or URL")
    .addStringOption(opt =>
      opt.setName("query").setDescription("Song name or URL").setRequired(true)
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
    .setDescription("Set volume")
    .addIntegerOption(opt =>
      opt.setName("percent").setDescription("Volume (1-100)").setRequired(true)
    )
].map(cmd => cmd.toJSON());

// --- Deploy Commands ---
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );
    console.log("✅ Slash commands registered!");
  } catch (e) {
    console.error("❌ Failed to register commands:", e);
  }
})();

// --- Interaction Handler ---
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  if (commandName === "play") {
    const query = interaction.options.getString("query");
    const channel = interaction.member.voice.channel;
    if (!channel)
      return interaction.reply("❌ Voice channel join karo pehle.");

    try {
      await interaction.deferReply();  // Defer the reply to prevent timeout
      distube.play(channel, query, {
        textChannel: interaction.channel,
        member: interaction.member
      });

      interaction.followUp(`🎶 Playing: **${query}**`);  // Send follow-up after song is played
    } catch (error) {
      console.error("Error in play command:", error);
      interaction.followUp("❌ Something went wrong while playing the song.");
    }
  }

  if (commandName === "skip") {
    const q = distube.getQueue(interaction);
    if (!q) return interaction.reply("❌ Queue empty hai.");
    try {
      await q.skip();
      interaction.reply("⏭️ Skipped!");
    } catch (error) {
      console.error("Error skipping song:", error);
      interaction.reply("❌ Failed to skip the song.");
    }
  }

  if (commandName === "stop") {
    const q = distube.getQueue(interaction);
    if (!q) return interaction.reply("❌ Kuch play hi nahi ho raha.");
    try {
      q.stop();
      interaction.reply("⏹️ Stopped and cleared queue!");
    } catch (error) {
      console.error("Error stopping song:", error);
      interaction.reply("❌ Failed to stop the song.");
    }
  }

  if (commandName === "queue") {
    const q = distube.getQueue(interaction);
    if (!q) return interaction.reply("❌ Queue empty hai.");
    try {
      interaction.reply(
        `📜 **Current Queue:**\n${q.songs
          .map((song, i) => `${i === 0 ? "▶️" : `${i}.`} ${song.name} - ${song.formattedDuration}`)
          .join("\n")}`
      );
    } catch (error) {
      console.error("Error retrieving queue:", error);
      interaction.reply("❌ Failed to fetch queue.");
    }
  }

  if (commandName === "pause") {
    const q = distube.getQueue(interaction);
    if (!q) return interaction.reply("❌ Queue empty hai.");
    try {
      q.pause();
      interaction.reply("⏸️ Paused!");
    } catch (error) {
      console.error("Error pausing song:", error);
      interaction.reply("❌ Failed to pause the song.");
    }
  }

  if (commandName === "resume") {
    const q = distube.getQueue(interaction);
    if (!q) return interaction.reply("❌ Queue empty hai.");
    try {
      q.resume();
      interaction.reply("▶️ Resumed!");
    } catch (error) {
      console.error("Error resuming song:", error);
      interaction.reply("❌ Failed to resume the song.");
    }
  }

  if (commandName === "volume") {
    const percent = interaction.options.getInteger("percent");
    if (percent < 1 || percent > 100)
      return interaction.reply("❌ Volume 1-100 ke beech me set karo.");
    const q = distube.getQueue(interaction);
    if (!q) return interaction.reply("❌ Queue empty hai.");
    try {
      q.setVolume(percent);
      interaction.reply(`🔊 Volume set to **${percent}%**`);
    } catch (error) {
      console.error("Error setting volume:", error);
      interaction.reply("❌ Failed to set volume.");
    }
  }
});

// --- DisTube Events ---
distube
  .on("playSong", (queue, song) => {
    queue.textChannel?.send(
      `▶️ Now Playing: **${song.name}** - ${song.formattedDuration}`
    );
  })
  .on("addSong", (queue, song) => {
    queue.textChannel?.send(`➕ Added: **${song.name}**`);
  })
  .on("error", (channel, error) => {
    channel?.send("⚠️ Error: " + error.message.slice(0, 200));
  });

// --- Login ---
client.login(process.env.DISCORD_TOKEN);