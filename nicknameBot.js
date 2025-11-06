require('dotenv').config();
const fs = require('fs');
const express = require('express');
const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  ActivityType, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} = require('discord.js');

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
  } catch {}
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

// === Nickname Request System with Buttons ===
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.channel.id !== TARGET_CHANNEL_ID) return;

  let newNick = message.content.trim();
  if (!newNick) return;

  // Remove optional allowed prefixes
  const allowedPrefixes = ['!', ':']; 
  const firstChar = newNick.charAt(0);
  if (allowedPrefixes.includes(firstChar)) {
    newNick = newNick.slice(1).trim();
  }

  const member = await message.guild.members.fetch(message.author.id);
  const oldNick = member.nickname || member.user.username;

  // Role hierarchy safety
  const botMember = message.guild.members.me;
  if (member.roles.highest.position >= botMember.roles.highest.position) {
    return message.reply("⚠️ I can't change your nickname because your role is higher or equal to mine.");
  }

  const embed = new EmbedBuilder()
    .setColor(0x00aaff)
    .setTitle("📝 Nickname Change Request")
    .addFields(
      { name: "User", value: `${member.user.tag}` },
      { name: "Old Nickname", value: oldNick },
      { name: "Requested Nickname", value: newNick }
    )
    .setFooter({ text: getCreditMessage() })
    .setTimestamp();

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('accept')
        .setLabel('✅ Accept')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('reject')
        .setLabel('❌ Reject')
        .setStyle(ButtonStyle.Danger)
    );

  const botMsg = await message.channel.send({ embeds: [embed], components: [row] });

  // Collector for button clicks
  const collector = botMsg.createMessageComponentCollector({
    componentType: 'BUTTON',
    time: 120000 // 2 mins
  });

  collector.on('collect', async (interaction) => {
    if (!interaction.member.roles.cache.has(NICK_MANAGER_ROLE_ID)) {
      return interaction.reply({ content: "⚠️ You don't have permission to manage nicknames.", ephemeral: true });
    }

    await interaction.deferUpdate(); // prevent "This interaction failed"

    if (interaction.customId === 'accept') {
      try {
        nickHistory.set(member.id, oldNick);
        await member.setNickname(newNick);
        saveHistory();

        await interaction.editReply({ content: `✅ Nickname changed to **${newNick}**`, embeds: [], components: [] });

        const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
        if (logChannel) logChannel.send(`✅ **${member.user.tag}** nickname changed to **${newNick}** by **${interaction.user.tag}**.`);
      } catch (err) {
        console.error("Nickname change failed:", err);
        await interaction.editReply({ content: "❌ Failed to change nickname.", embeds: [], components: [] });
      }
    }

    if (interaction.customId === 'reject') {
      await interaction.editReply({ content: "❌ Request Rejected.", embeds: [], components: [] });

      const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
      if (logChannel) logChannel.send(`❌ Nickname request rejected for **${member.user.tag}** by **${interaction.user.tag}**.`);
    }

    collector.stop();
  });
});

// === Restore Command ===
client.on('messageCreate', async (message) => {
  if (!message.content.startsWith("nickreset")) return;

  const member = message.mentions.members.first();
  if (!member) return message.reply("🔍 Mention someone.");

  const oldNick = nickHistory.get(member.id);
  if (!oldNick) return message.reply("ℹ️ No previous nickname stored.");

  await member.setNickname(oldNick);
  nickHistory.delete(member.id);
  saveHistory();

  message.reply(`🔁 Restored nickname to **${oldNick}**`);
});

// === Keep Alive ===
const app = express();
app.get("/", (req, res) => res.send("Bot Running ✅"));
app.listen(process.env.PORT || 3000);

// === Login ===
client.login(process.env.DISCORD_TOKEN);
