require('dotenv').config();
const fs = require('fs');
const express = require('express');
const { Client, GatewayIntentBits, EmbedBuilder, ActivityType, PermissionsBitField } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ]
});

// === ENV Vars ===
const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const NICK_MANAGER_ROLE_ID = process.env.NICK_MANAGER_ROLE_ID;
const ENCODED_CREDIT = process.env.ENCODED_CREDIT || 'VGFrZSBMb3ZlIEZyb20gSHlwZXJfRGV0ZWN0aXZl';

function getCreditMessage() {
  return Buffer.from(ENCODED_CREDIT, 'base64').toString('utf8');
}

// === Nick History ===
const nickHistory = new Map();
const HISTORY_FILE = 'nickHistory.json';

if (fs.existsSync(HISTORY_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    for (const [id, oldNick] of data) nickHistory.set(id, oldNick);
  } catch (err) {}
}

function saveHistory() {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify([...nickHistory], null, 2));
}

process.on('exit', saveHistory);
process.on('SIGINT', () => { saveHistory(); process.exit(); });

// === Bot Ready ===
client.once('ready', () => {
  client.user.setPresence({
    activities: [{ name: getCreditMessage(), type: ActivityType.Listening }],
    status: 'online',
  });
  console.log(`✅ Bot Active as ${client.user.tag}`);
});

// === Request System ===
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.channel.id !== TARGET_CHANNEL_ID) return;

  const match = message.content.match(/^nick:\s*(.+)$/i);
  if (!match) return;

  const newNick = match[1];
  const member = message.member;
  const oldNick = member.nickname || member.user.username;

  const embed = new EmbedBuilder()
    .setColor(0x00aaff)
    .setTitle("📝 Nickname Change Request")
    .addFields(
      { name: "User", value: `${member.user.tag}` },
      { name: "Old Nickname", value: oldNick },
      { name: "Requested New Nickname", value: newNick }
    )
    .setTimestamp()
    .setFooter({ text: getCreditMessage() });

  const botMsg = await message.channel.send({ embeds: [embed] });

  // Wait for Approve/Reject
  const collector = message.channel.createMessageCollector({
    filter: (m) =>
      !m.author.bot &&
      m.member.roles.cache.has(NICK_MANAGER_ROLE_ID) &&
      (m.content.toLowerCase() === "accept" || m.content.toLowerCase() === "reject"),
    time: 60000,
  });

  collector.on('collect', async (m) => {
    if (m.content.toLowerCase() === "accept") {
      try {
        nickHistory.set(member.id, oldNick);
        await member.setNickname(newNick);
        saveHistory();

        botMsg.reply(`✅ Nickname changed to **${newNick}**`);
      } catch {
        botMsg.reply("❌ Failed to change nickname.");
      }
    } else {
      botMsg.reply("❌ Request Rejected.");
    }

    collector.stop();
  });
});

// === Log Resets (Optional Command) ===
client.on('messageCreate', async (message) => {
  if (message.content.startsWith("nickreset")) {
    const member = message.mentions.members.first();
    if (!member) return;

    const oldNick = nickHistory.get(member.id);
    if (!oldNick) return message.reply("ℹ️ No saved nickname.");

    await member.setNickname(oldNick);
    nickHistory.delete(member.id);
    saveHistory();

    message.reply(`🔁 Restored nickname: **${oldNick}**`);
  }
});

// === Keep Alive ===
const app = express();
app.get("/", (req, res) => res.send("Bot Running"));
app.listen(process.env.PORT || 3000);

// === Login ===
client.login(process.env.DISCORD_TOKEN);
