
const { Client, GatewayIntentBits, EmbedBuilder, ActivityType, PermissionsBitField } = require('discord.js');

// Bot client with required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// Your custom IDs here
const TARGET_CHANNEL_ID = 'YOUR_CHANNEL_ID';
const LOG_CHANNEL_ID = 'YOUR_LOG_CHANNEL_ID';
const SERVER_ID = 'YOUR_SERVER_ID';

// 🛡 Encoded credit message (base64)
const ENCODED_CREDIT = 'VGFrZSBMb3ZlIEZyb20gSHlwZXJfRGV0ZWN0aXZl';

// 🔐 Function to decode credit
function getCreditMessage() {
  return Buffer.from(ENCODED_CREDIT, 'base64').toString('utf8');
}

// 🌐 Bot ready event
client.once('ready', () => {
  const credit = getCreditMessage();

  // Bot status: RPC-style + custom message
  client.user.setPresence({
    activities: [{
      name: credit,
      type: ActivityType.Listening, // Options: Playing, Watching, Listening, Streaming
    }],
    status: 'online',
  });

  console.log(`🚀 Bot online as ${client.user.tag}`);
});

// 📩 Message event
client.on('messageCreate', async (message) => {
  if (message.author.bot || message.channel.id !== TARGET_CHANNEL_ID) return;

  const guild = client.guilds.cache.get(SERVER_ID);
  if (!guild) return;

  const member = guild.members.cache.get(message.author.id);
  if (!member) return;

  // Ensure permission to set nickname
  if (!guild.members.me.permissions.has(PermissionsBitField.Flags.ManageNicknames)) {
    console.log("❌ Missing Manage Nicknames permission.");
    return;
  }

  const newNickname = `💬 ${message.content.substring(0, 20)} • ${message.author.username}`;
  try {
    await member.setNickname(newNickname.substring(0, 32));

    // Embed for user
    const replyEmbed = new EmbedBuilder()
      .setColor(0x00AE86)
      .setTitle("✅ Nickname Updated!")
      .setDescription(`Your nickname is now:\n\\`${newNickname}\``)
      .setFooter({ text: getCreditMessage() });

    await message.reply({ embeds: [replyEmbed] });

    // Log embed
    const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
    if (logChannel && logChannel.isTextBased()) {
      const logEmbed = new EmbedBuilder()
        .setColor(0xff9900)
        .setTitle("📋 Nickname Change Log")
        .addFields(
          { name: 'User', value: `${message.author.tag} (${message.author.id})` },
          { name: 'New Nickname', value: newNickname },
          { name: 'Channel', value: `<#${TARGET_CHANNEL_ID}>` },
          { name: 'Server ID', value: SERVER_ID }
        )
        .setFooter({ text: getCreditMessage() })
        .setTimestamp();

      logChannel.send({ embeds: [logEmbed] });
    }

  } catch (error) {
    console.error("⚠️ Error updating nickname:", error);
  }
});

// 🔐 Secure login
client.login('YOUR_BOT_TOKEN');
