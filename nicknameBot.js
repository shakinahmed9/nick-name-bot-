require('dotenv').config();
const fs = require('fs');
const { Client, GatewayIntentBits, EmbedBuilder, ActivityType, PermissionsBitField } = require('discord.js');

// === Discord Client ===
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// === Load environment variables ===
const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID;
const LOG_CHANNEL_ID    = process.env.LOG_CHANNEL_ID;
const SERVER_ID         = process.env.SERVER_ID;
const ENCODED_CREDIT    = process.env.ENCODED_CREDIT || 'VGFrZSBMb3ZlIEZyb20gSHlwZXJfRGV0ZWN0aXZl';

// === Decode credit function ===
function getCreditMessage() {
  return Buffer.from(ENCODED_CREDIT, 'base64').toString('utf8');
}

// === Nickname history system ===
const nickHistory = new Map();
const HISTORY_FILE = 'nickHistory.json';

// Load previous data if file exists
if (fs.existsSync(HISTORY_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    for (const [userId, oldNick] of data) nickHistory.set(userId, oldNick);
    console.log(`📁 Loaded ${nickHistory.size} nickname records from JSON.`);
  } catch (err) {
    console.error("⚠️ Failed to load nickHistory.json:", err);
  }
}

// Save data function
function saveHistory() {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify([...nickHistory], null, 2));
    console.log("💾 Nickname history saved.");
  } catch (err) {
    console.error("⚠️ Error saving nickHistory.json:", err);
  }
}

// Save on shutdown
process.on('SIGINT', () => {
  console.log("🛑 Saving nickname history before exit...");
  saveHistory();
  process.exit();
});
process.on('exit', () => saveHistory());

// === Bot Ready Event ===
client.once('ready', () => {
  const credit = getCreditMessage();
  client.user.setPresence({
    activities: [{ name: credit, type: ActivityType.Listening }],
    status: 'online',
  });
  console.log(`🚀 Bot online as ${client.user.tag}`);
});

// === Message Command Handler ===
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const args = message.content.trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();

  // ----------------------
  // !nick Command
  // ----------------------
  if (command === '!nick') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageNicknames))
      return message.reply("❌ You don't have permission to use this command!");

    const member = message.mentions.members.first();
    if (!member) return message.reply("⚠️ Mention a user!");
    const newNick = args[0] && !args[0].startsWith('<') ? args[0] : args[1];
    if (!newNick) return message.reply("⚠️ Provide a new nickname!");

    const timeArg = args.find(a => /[smhd]$/i.test(a)); // e.g. 10m, 2h
    let durationMs = 0;
    if (timeArg) {
      const num = parseInt(timeArg);
      const unit = timeArg.slice(-1);
      const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
      durationMs = num * (multipliers[unit] || 0);
    }

    const oldNick = member.nickname || member.user.username;

    try {
      await member.setNickname(newNick);
      await message.reply(`✅ Changed nickname of ${member.user.tag} to **${newNick}**`);
      nickHistory.set(member.id, oldNick);
      saveHistory(); // 💾 Save immediately

      // === Send log embed to log channel ===
      const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
      if (logChannel && logChannel.isTextBased()) {
        const logEmbed = new EmbedBuilder()
          .setColor(0xffa500)
          .setTitle("📋 Nickname Changed")
          .addFields(
            { name: "User", value: `${member.user.tag} (${member.id})` },
            { name: "Old Nickname", value: oldNick || "None", inline: true },
            { name: "New Nickname", value: newNick, inline: true },
            { name: "Changed By", value: `<@${message.author.id}>` },
          )
          .setTimestamp()
          .setFooter({ text: getCreditMessage() });

        logChannel.send({ embeds: [logEmbed] });
      }

      // Auto revert
      if (durationMs > 0) {
        setTimeout(async () => {
          try {
            await member.setNickname(oldNick);
            await message.channel.send(`⏰ Nickname of ${member.user.tag} reverted to **${oldNick}**`);
            nickHistory.delete(member.id);
            saveHistory();
          } catch (err) {
            console.error("Failed to revert nickname:", err);
          }
        }, durationMs);
      }

    } catch (err) {
      console.error(err);
      message.reply("❌ Failed to change nickname. Maybe missing permission?");
    }
  }

  // ----------------------
  // !nickreset Command
  // ----------------------
  if (command === '!nickreset') {
    const member = message.mentions.members.first();
    if (!member) return message.reply("⚠️ Mention a user to reset!");
    const oldNick = nickHistory.get(member.id);
    if (!oldNick) return message.reply("ℹ️ No nickname history found for that user.");

    try {
      await member.setNickname(oldNick);
      await message.reply(`🔁 Nickname of ${member.user.tag} restored to **${oldNick}**`);
      nickHistory.delete(member.id);
      saveHistory();

      // Log reset
      const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
      if (logChannel && logChannel.isTextBased()) {
        const resetEmbed = new EmbedBuilder()
          .setColor(0x00AE86)
          .setTitle("🔄 Nickname Reset")
          .addFields(
            { name: "User", value: `${member.user.tag} (${member.id})` },
            { name: "Restored Nickname", value: oldNick },
            { name: "Reset By", value: `<@${message.author.id}>` },
          )
          .setTimestamp()
          .setFooter({ text: getCreditMessage() });

        logChannel.send({ embeds: [resetEmbed] });
      }

    } catch (err) {
      console.error(err);
      message.reply("❌ Failed to reset nickname.");
    }
  }
});

// === Secure Login ===
client.login(process.env.DISCORD_TOKEN);

// === Keep Bot Alive on Render ===
const express = require('express');
const app = express();

app.get('/', (req, res) => res.send('Bot is running!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
