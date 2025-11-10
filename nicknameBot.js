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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ]
});

// ENV Vars
const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const NICK_MANAGER_ROLE_ID = process.env.NICK_MANAGER_ROLE_ID;

// Nick history load
const nickHistory = new Map();
const HISTORY_FILE = 'nickHistory.json';
if (fs.existsSync(HISTORY_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    for (const [id, oldNick] of data) nickHistory.set(id, oldNick);
  } catch {}
}
const saveHistory = () =>
  fs.writeFileSync(HISTORY_FILE, JSON.stringify([...nickHistory], null, 2));

process.on('exit', saveHistory);
process.on('SIGINT', () => { saveHistory(); process.exit(); });

client.once('ready', () => {
  client.user.setPresence({
    activities: [{ name: "Nickname System Active", type: ActivityType.Listening }],
    status: 'online'
  });
  console.log(`✅ Bot Active as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.channel.id !== TARGET_CHANNEL_ID) return;

  let newNick = message.content.trim();
  if (!newNick) return;

  const member = await message.guild.members.fetch(message.author.id);
  const oldNick = member.nickname || member.user.username;

  const botMember = message.guild.members.me;
  if (member.roles.highest.position >= botMember.roles.highest.position) {
    return message.reply("⚠️ Can't change nickname because your role is equal or higher than mine.");
  }

  const requestId = `REQ-${Math.random().toString(36).slice(2, 6)}`;

  const embed = new EmbedBuilder()
    .setColor(0x2bafff)
    .setTitle("📝 Nickname Change Request")
    .setThumbnail(member.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: "👤 User", value: `${member}`, inline: true },
      { name: "🆔 Request ID", value: requestId, inline: true },
      { name: "📝 Requested Nickname", value: `${newNick}`, inline: false }
    )
    .setTimestamp();

  // BUTTONS ONLY FOR MOD ROLE
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder().setCustomId('accept').setLabel('✅ Approve').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('reject').setLabel('❌ Reject').setStyle(ButtonStyle.Danger)
    );

  const requestMsg = await message.channel.send({
    embeds: [embed],
    components: [row],
    allowedMentions: { users: [] }
  });

  const collector = requestMsg.createMessageComponentCollector({ time: 180000 });

  collector.on('collect', async (interaction) => {

    // **Hide button from non-role users**
    if (!interaction.member.roles.cache.has(NICK_MANAGER_ROLE_ID)) {
      return interaction.reply({ content: "⚠️ You are not allowed to review nickname requests.", ephemeral: true });
    }

    await interaction.deferUpdate();
    const mod = interaction.member;

    const time = `<t:${Math.floor(Date.now() / 1000)}:F>`;

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
            { name: "🆕 New Nickname", value: `${newNick}`, inline: false },
            { name: "🆔 Request ID", value: requestId, inline: true },
            { name: "⏱️ Process Time", value: time, inline: true },
            { name: "📌 Status", value: "🟢 Approved", inline: false }
          );

        await requestMsg.edit({ embeds: [successEmbed], components: [] });
        member.send({ embeds: [successEmbed] }).catch(() => {});
        const log = message.guild.channels.cache.get(LOG_CHANNEL_ID);
        if (log) log.send({ embeds: [successEmbed] });

      } catch {
        requestMsg.edit({ content: "❌ Nickname change failed (Role hierarchy issue)", components: [] });
      }
    }

    if (interaction.customId === "reject") {
      const rejectEmbed = new EmbedBuilder()
        .setColor(0xff4e4e)
        .setTitle("❌ Nickname Request Rejected")
        .setThumbnail(member.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: "👤 User", value: `${member}`, inline: true },
          { name: "👮 Moderator", value: `${mod}`, inline: true },
          { name: "🆔 Request ID", value: requestId, inline: true },
          { name: "⏱️ Process Time", value: time, inline: true },
          { name: "📌 Status", value: "🔴 Rejected", inline: false }
        );

      await requestMsg.edit({ embeds: [rejectEmbed], components: [] });
      member.send({ embeds: [rejectEmbed] }).catch(() => {});
      const log = message.guild.channels.cache.get(LOG_CHANNEL_ID);
      if (log) log.send({ embeds: [rejectEmbed] });
    }
  });
});

// nickreset @user
client.on('messageCreate', async (message) => {
  if (!message.content.startsWith("nickreset")) return;
  const user = message.mentions.members.first();
  if (!user) return message.reply("Mention someone.");
  const old = nickHistory.get(user.id);
  if (!old) return message.reply("No old nickname stored.");
  await user.setNickname(old);
  message.reply(`🔁 Restored nickname to **${old}**`);
});

const app = express();
app.get("/", (req, res) => res.send("Bot Running ✅"));
app.listen(process.env.PORT || 3000);

client.login(process.env.DISCORD_TOKEN);
