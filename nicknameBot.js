client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim().toLowerCase();

  // ✅ CLEAR NICK COMMAND (works with any capitalization)
  if (content === "clear nick") {
    try {
      const member = await message.guild.members.fetch(message.author.id);
      await member.setNickname(null);
      message.reply("🧼 Your nickname has been cleared successfully!");
    } catch (err) {
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

  // Base request embed (visible to everyone)
  const requestEmbed = new EmbedBuilder()
    .setColor(0x2bafff)
    .setTitle("📝 Nickname Change Request")
    .setThumbnail(member.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: "👤 User", value: `${member}`, inline: true },
      { name: "🆔 Request ID", value: requestId, inline: true },
      { name: "🧾 Old Nickname", value: `${oldNick}`, inline: false },
      { name: "🆕 Requested Nickname", value: `${newNick}`, inline: false }
    )
    .setTimestamp();

  // Send request embed in target channel (everyone sees this, no buttons)
  await message.channel.send({
    embeds: [requestEmbed],
    allowedMentions: { users: [] }
  });

  // ✅ Build mod-only version with buttons
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('accept')
        .setLabel('✅ Approve')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('reject')
        .setLabel('❌ Reject')
        .setStyle(ButtonStyle.Danger)
    );

  // ✅ Send moderator-only message (with buttons) in log channel
  const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
  if (!logChannel) return console.error("⚠️ Log channel not found!");

  const modMsg = await logChannel.send({
    embeds: [requestEmbed],
    components: [row],
    allowedMentions: { users: [] }
  });

  // ✅ Create collector for moderator actions
  const collector = modMsg.createMessageComponentCollector({ time: 180000 });

  collector.on('collect', async (interaction) => {
    const mod = await interaction.guild.members.fetch(interaction.user.id);

    // Only users with NICK_MANAGER_ROLE_ID can approve/reject
    if (!mod.roles.cache.has(NICK_MANAGER_ROLE_ID)) {
      return interaction.reply({
        content: "⚠️ You are not allowed to review nickname requests.",
        ephemeral: true
      });
    }

    await interaction.deferUpdate();
    const time = `<t:${Math.floor(Date.now() / 1000)}:F>`;

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
          );

        await modMsg.edit({ embeds: [successEmbed], components: [] });
        const targetLog = message.guild.channels.cache.get(LOG_CHANNEL_ID);
        if (targetLog) targetLog.send({ embeds: [successEmbed] });
        member.send({ embeds: [successEmbed] }).catch(() => {});
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
        );

      await modMsg.edit({ embeds: [rejectEmbed], components: [] });
      const targetLog = message.guild.channels.cache.get(LOG_CHANNEL_ID);
      if (targetLog) targetLog.send({ embeds: [rejectEmbed] });
      member.send({ embeds: [rejectEmbed] }).catch(() => {});
    }
  });
});
