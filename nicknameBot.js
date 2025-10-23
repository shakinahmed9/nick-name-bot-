require('dotenv').config();

// nicknameBot.js (top)
const { Client, GatewayIntentBits, EmbedBuilder, ActivityType, PermissionsBitField } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// Load env (if you run with node directly ensure process.env is set or use dotenv)
const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID;
const LOG_CHANNEL_ID    = process.env.LOG_CHANNEL_ID;
const SERVER_ID         = process.env.SERVER_ID;

// Optional: keep encoded credit in env or fallback to current value
const ENCODED_CREDIT = process.env.ENCODED_CREDIT || 'VGFrZSBMb3ZlIEZyb20gSHlwZXJfRGV0ZWN0aXZl';

// 🔐 Function to decode credit
function getCreditMessage() {
  return Buffer.from(ENCODED_CREDIT, 'base64').toString('utf8');
}

// nicknameBot.js এর শুরুর দিকে যোগ করো
const nickHistory = new Map(); // আগের nickname মনে রাখবে

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
  if (message.author.bot) return;

  const args = message.content.trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();

  // ----------------------
  // !nick command
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
      nickHistory.set(member.id, oldNick); // store old name
      console.log(`Stored old nickname for ${member.user.tag}: ${oldNick}`);

      // Auto revert
      if (durationMs > 0) {
        setTimeout(async () => {
          try {
            await member.setNickname(oldNick);
            await message.channel.send(`⏰ Nickname of ${member.user.tag} reverted to **${oldNick}**`);
            nickHistory.delete(member.id);
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
  // !nickreset command
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
    } catch (err) {
      console.error(err);
      message.reply("❌ Failed to reset nickname.");
    }
  }
});

// 🔐 Secure login
client.login(process.env.DISCORD_TOKEN);

