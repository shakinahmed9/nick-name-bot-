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

// Handle nickname request
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

  const requestId = `DC-${Math.random().toString(36).slice(2, 6)}-${Math.random().toString(36).slice(2, 6)}`;

  const embed = new EmbedBuilder()
    .setColor(0x2bafff)
    .setTitle("📝 Nickname Change Request")
    .setThumbnail(member.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: "👤 User", value: `${member}` },
      { name: "🆕 Requested", value: `${newNick}` },
      { name: "🪪 Request ID", value: requestId }
    )
    .setTimestamp();

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder().setCustomId('accept').setLabel('✅ Approve').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('reject').setLabel('❌ Reject').setStyle(ButtonStyle.Danger)
    );

  const requestMsg = await message.channel.send({ embeds: [embed], components: [row] });

  const collector = requestMsg.createMessageComponentCollector({ time: 180000 });

  collector.on('collect', async (interaction) => {
    if (!interaction.member.roles.cache.has(NICK_MANAGER_ROLE_ID))
      return interaction.reply({ content: "⚠️ Only nickname managers can approve.", ephemeral: true });

    await interaction.deferUpdate();

    const mod = interaction.member;

    if (interaction.customId === "accept") {
      try {
        nickHistory.set(member.id, oldNick);
        saveHistory();
        await member.setNickname(newNick);

        const successEmbed = new EmbedBuilder()
          .setColor(0x00ff6a)
          .setTitle("✅ Nickname Request Approved")
          .addFields(
            { name: "👤 User", value: `${member}` },
            { name: "🆕 New Nickname", value: newNick },
            { name: "👮 Moderator", value: mod.user.tag },
            { name: "🪪 Request ID", value: requestId }
          )
          .setTimestamp();

        await requestMsg.edit({ embeds: [successEmbed], components: [] });

        member.send(`✅ Your nickname request has been approved!\nNew Name: **${newNick}**`);
        const log = message.guild.channels.cache.get(LOG_CHANNEL_ID);
        if (log) log.send({ embeds: [successEmbed] });

      } catch (e) {
        requestMsg.edit({ content: "❌ Nickname change failed (role hierarchy issue)", components: [] });
      }
    }

    if (interaction.customId === "reject") {
      const rejectEmbed = new EmbedBuilder()
        .setColor(0xff4e4e)
        .setTitle("❌ Nickname Request Rejected")
        .addFields(
          { name: "👤 User", value: `${member}` },
          { name: "👮 Moderator", value: mod.user.tag },
          { name: "🪪 Request ID", value: requestId }
        )
        .setTimestamp();

      await requestMsg.edit({ embeds: [rejectEmbed], components: [] });
      member.send(`❌ Your nickname request has been rejected.`);
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
