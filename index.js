import {
  Client,
  GatewayIntentBits,
  Partials,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  Events,
  PermissionsBitField,
} from 'discord.js';
import fs from 'fs/promises';

// Chargement de la config
const config = JSON.parse(await fs.readFile('./config.json', 'utf8'));

// Fichier de base de données
const dbFile = './db.json';

// Création du client Discord
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
  partials: [Partials.Message, Partials.Channel],
});

// Quand le bot est prêt
client.once('ready', async () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('on_duty')
      .setLabel('🟢 ON-Duty')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('off_duty')
      .setLabel('🔴 OFF-Duty')
      .setStyle(ButtonStyle.Danger)
  );

  // Récupération du salon pour poster le menu
  const menuChannel = await client.channels.fetch(config.menuChannelId).catch(() => null);
  if (menuChannel) {
    await menuChannel.send({
      content: `📌 **Punch**\nClique sur un bouton pour activer ou désactiver ton service.`,
      components: [row],
    });
  } else {
    console.warn('⚠️ Salon menu introuvable dans la config.');
  }
});

// Gestion des clics sur les boutons
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;

  const userId = interaction.user.id;
  const now = Date.now();
  const db = JSON.parse(await fs.readFile(dbFile).catch(() => '{}'));
  const member = await interaction.guild.members.fetch(userId).catch(() => null);

  if (!member) {
    return interaction.reply({
      content: '⚠️ Membre introuvable.',
      ephemeral: true
    });
  }

  // Vérification des permissions du bot
  const botMember = await interaction.guild.members.fetchMe();
  const botRole = botMember.roles.highest;

  const onRole = interaction.guild.roles.cache.get(config.onDutyRoleId);
  const offRole = interaction.guild.roles.cache.get(config.offDutyRoleId);

  if (
    !onRole || !offRole ||
    botRole.position <= onRole.position ||
    botRole.position <= offRole.position
  ) {
    return interaction.reply({
      content: '🚫 Le bot n’a pas la permission de gérer ces rôles. Vérifie la hiérarchie.',
      ephemeral: true
    });
  }

  // Action selon le bouton cliqué
  if (interaction.customId === 'on_duty') {
    try {
      await member.roles.add(config.onDutyRoleId);
      await member.roles.remove(config.offDutyRoleId);
    } catch (err) {
      return interaction.reply({
        content: '❌ Erreur lors de l’ajout/suppression des rôles.',
        ephemeral: true
      });
    }

    db[userId] = now;
    await fs.writeFile(dbFile, JSON.stringify(db, null, 2));
    return interaction.reply({
      content: '🟢 Tu es maintenant en service !',
      ephemeral: true
    });
  }

  if (interaction.customId === 'off_duty') {
    const start = db[userId];
    if (!start) {
      return interaction.reply({
        content: '⚠️ Tu dois être ON-Duty avant de te déconnecter.',
        ephemeral: true
      });
    }

    try {
      await member.roles.remove(config.onDutyRoleId);
      await member.roles.add(config.offDutyRoleId);
    } catch (err) {
      return interaction.reply({
        content: '❌ Erreur lors de l’ajout/suppression des rôles.',
        ephemeral: true
      });
    }

    const duration = now - start;
    const minutes = Math.floor(duration / 60000);
    const hours = Math.floor(minutes / 60);
    const remainMin = minutes % 60;

    const logMessage = `👮 ${interaction.user.tag} a été en service pendant **${hours}h ${remainMin}min**\n📅 <t:${Math.floor(now / 1000)}:F>`;
    const logChannel = await client.channels.fetch(config.logChannelId).catch(() => null);
    if (logChannel) logChannel.send(logMessage);

    delete db[userId];
    await fs.writeFile(dbFile, JSON.stringify(db, null, 2));

    return interaction.reply({
      content: '🔴 Tu as quitté le service. Merci !',
      ephemeral: true
    });
  }
});

// Lancement du bot
client.login(config.token);
