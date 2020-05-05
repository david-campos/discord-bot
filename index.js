const config = require('./bot-config.json');
const moment = require('moment');
const Discord = require('discord.js');
const fs = require('fs');
const client = new Discord.Client();

client.commands = new Discord.Collection();
const context = {
  client: client,
};

function registerCommand(cmd) {
	if (!cmd) return;
	client.commands.set(cmd.name, cmd);
	if (cmd.hooks && typeof cmd.hooks === "object") {
		Object.entries(cmd.hooks).forEach(hook => client.on(hook[0], hook[1]));
	}
}

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('message', msg => {
  if (msg.author.bot) return;
  const withPrefix = msg.content.startsWith(config.prefix);
  if (!(withPrefix/*|| msg.mentions.has(client.user)*/)) return;
  const args = msg.content.slice(config.prefix.length).split(/ +/);
  const command = args.shift().toLowerCase();
  if (!client.commands.has(command)) {
    if (!config.silentMode) {
      msg.reply(`lo siento, pero creo que no conozco ese comando${msg.author&&msg.author.username === "jnxf" ? ", pedacísimo de perro" : ""}.`);
    }
    return;
  }
  try {
    client.commands.get(command).execute(msg, args, context);
  } catch (error) {
    console.error(error);
    if (error.message && !config.silentMode) {
      msg.reply(`lo siento, ha habido un error ejecutando ese comando: ${error.message}`);
    } else {
      msg.reply(`lo siento, ha habido un error ejecutando ese comando.`);
    }
  }
});

const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  if (Array.isArray(command)) {
    for (const cmd of command) {
      registerCommand(cmd);
    }
    console.log(`Loaded commands ${command.map(cmd => `"${cmd.name}"`).join(', ')} from ./commands/${file}`);
  } else {
    registerCommand(command);
    console.log(`Loaded command "${command.name}" from ./commands/${file}`);
  }
}

moment.locale(config.locale);
client.login(config.token);
