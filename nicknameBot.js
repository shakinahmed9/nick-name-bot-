// ✅ Load dependencies
require('dotenv').config();
const fs = require('fs');
const express = require('express');
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActivityType
} = require('discord.js');

// ✅ Initialize Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ]
});

// ✅ ENV Variables
const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const NICK_MANAGER_ROLE_ID = process.env.NICK_MANAGER_ROLE_ID;

// ✅ Nick History Management
const nickHistory = new Map();
const HISTORY_FILE = 'nickHistory.json';

if (fs.existsSync(HISTORY_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    for (const [id, oldNick] of data) nickHistory.set(id, oldNick);
  } catch (err) {
    console.error('⚠️ Error reading history file:', err);
  }
}

const saveHistory = () =>
  fs.writeFileSync(HISTORY_FILE, JSON.stringify([...nickHistory], null, 2));

process.on('exit', saveHistory);
process.on('SIGINT', () => {
  saveHistory();
  process.exit();
});

// ✅ Bot Ready Event
client.once('ready', () => {
  client.user.setPresence({
    activities: [{ name: "Nickname System Active", type: ActivityType.Listening }],
    status: 'online'
  });
  console.log(`✅ Bot Active as ${client.user.tag}`);
});

// ✅ Message Create Handler
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim().toLowerCase();

  // ✅ CLEAR NICK COMMAND
  if (content === "clear nick") {
    try {
      const member = await message.guild.members.fetch(message.author.id);
      await member.setNickname(null);
      message.reply("🧼 Your nickname has been cleared successfully!");
    } catch {
      message.reply("⚠️ I couldn’t clear your nickname (missing permission or role hierarchy).");
    }
    return;
  }

  // ✅ NICKNAME REQUEST HANDLER
  if (message.channel.id !== TARGET_CHANNEL_ID) return;

  const newNick = message.content.trim();
  if (!newNick) return;

  const member = await message.guild.members.fetch(message.author.id);
  const oldNick = member.nickname || member.user.username;

  const botMember = message.guild.members.me;
  if (member.roles.highest.position >= botMember.roles.highest.position) {
    return message.reply("⚠️ Can't change nickname because your role is equal or higher than mine.");
  }

  const requestId = `REQ-${Math.random().toString(36).slice(2, 6)}`;
  const time = `<t:${Math.floor(Date.now() / 1000)}:F>`;

  // ✅ Request Embed (shown to user)
  const requestEmbed = new EmbedBuilder()
    .setColor(0x2bafff)
    .setTitle("📝 Nickname Change Request Submitted")
    .setDescription("Your nickname change request has been sent for review by moderators.")
    .setThumbnail(member.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: "👤 User", value: `${member}`, inline: true },
      { name: "🆔 Request ID", value: requestId, inline: true },
      { name: "🧾 Old Nickname", value: `${oldNick}`, inline: false },
      { name: "🆕 Requested Nickname", value: `${newNick}`, inline: false },
      { name: "⏱️ Submitted", value: time, inline: false },
      { name: "📌 Status", value: "🟡 Pending Review", inline: false }
    )
    .setFooter({ text: "Wait for a moderator to approve or reject your request." })
    .setTimestamp();

  // ✅ Send confirmation to user in request channel
  const userMsg = await message.reply({ embeds: [requestEmbed], allowedMentions: { users: [] } });

  // ✅ Buttons for moderators
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('accept').setLabel('✅ Approve').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('reject').setLabel('❌ Reject').setStyle(ButtonStyle.Danger)
  );

  // ✅ Send to moderator log channel (with role mention)
  const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
  if (!logChannel) return console.error("⚠️ Log channel not found!");

  const modMention = `<@&${NICK_MANAGER_ROLE_ID}>`;

  const modMsg = await logChannel.send({
    content: `${modMention} 🔔 New nickname change request received.`,
    embeds: [requestEmbed],
    components: [row],
    allowedMentions: { roles: [NICK_MANAGER_ROLE_ID] }
  });

  // ✅ Create collector for moderator actions
  const collector = modMsg.createMessageComponentCollector({ time: 180000 });

  collector.on('collect', async (interaction) => {
    const mod = await interaction.guild.members.fetch(interaction.user.id);

    if (!mod.roles.cache.has(NICK_MANAGER_ROLE_ID)) {
      return interaction.reply({
        content: "⚠️ You are not allowed to review nickname requests.",
        ephemeral: true
      });
    }

    await interaction.deferUpdate();

    // ✅ APPROVE
    if (interaction.customId === "accept") {
      try {
        nickHistory.set(member.id, oldNick);
        saveHistory();
        await member.setNickname(newNick);

        const successEmbed = new EmbedBuilder()
          .setColor(0x4dff88)
          .setTitle("✅ Nickname Request Approved")
          .setThumbnail(member.displayAvatarURL({ dynamic: true }))
          .addFields(
            { name: "👤 User", value: `${member}`, inline: true },
            { name: "👮 Moderator", value: `${mod}`, inline: true },
            { name: "🧾 Old Nickname", value: `${oldNick}`, inline: false },
            { name: "🆕 New Nickname", value: `${newNick}`, inline: false },
            { name: "🆔 Request ID", value: requestId, inline: true },
            { name: "⏱️ Process Time", value: time, inline: true },
            { name: "📌 Status", value: "🟢 Approved", inline: false }
          )
          .setTimestamp();

        await modMsg.edit({ content: "✅ Request processed.", embeds: [successEmbed], components: [] });
        await userMsg.edit({ embeds: [successEmbed], components: [] });
        await member.send({ embeds: [successEmbed] }).catch(() => {});
      } catch {
        await modMsg.edit({
          content: "❌ Nickname change failed (Role hierarchy issue)",
          components: []
        });
      }
    }

    // ❌ REJECT
    if (interaction.customId === "reject") {
      const rejectEmbed = new EmbedBuilder()
        .setColor(0xff4e4e)
        .setTitle("❌ Nickname Request Rejected")
        .setThumbnail(member.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: "👤 User", value: `${member}`, inline: true },
          { name: "👮 Moderator", value: `${mod}`, inline: true },
          { name: "🧾 Old Nickname", value: `${oldNick}`, inline: false },
          { name: "🆕 Requested Nickname", value: `${newNick}`, inline: false },
          { name: "🆔 Request ID", value: requestId, inline: true },
          { name: "⏱️ Process Time", value: time, inline: true },
          { name: "📌 Status", value: "🔴 Rejected", inline: false }
        )
        .setTimestamp();

      await modMsg.edit({ content: "❌ Request processed.", embeds: [rejectEmbed], components: [] });
      await userMsg.edit({ embeds: [rejectEmbed], components: [] });
      await member.send({ embeds: [rejectEmbed] }).catch(() => {});
    }
  });
});

// ✅ Express Keep-Alive (for hosting)
const app = express();
app.get("/", (req, res) => res.send("Nickname Bot Running ✅"));
app.listen(process.env.PORT || 3000);

// ✅ Start Bot
client.login(process.env.DISCORD_TOKEN);
