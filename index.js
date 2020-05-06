const config = require('./bot-config.json');
const moment = require('moment');
const Discord = require('discord.js');
const fs = require('fs');
const client = new Discord.Client();
const Sequelize = require('sequelize');

client.commands = new Discord.Collection();

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: 'database.sqlite'
});

const context = {
    client: client,
    sequelize: sequelize
};

function registerCommand(cmd) {
    if (!cmd) return;
    client.commands.set(cmd.name, cmd);
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
            msg.reply(`lo siento, pero creo que no conozco ese comando${msg.author && msg.author.username === "jnxf" ? ", pedacísimo de perro" : ""}.`);
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

sequelize.authenticate().then(async () => {
    console.log('Connection to database has been established successfully.');

    process.on('exit', () => {
        sequelize.close()
        process.exit(0)
    })
    moment.locale(config.locale);

    // Register commands
    const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        console.log(`./commands/${file}`);
        const definition = require(`./commands/${file}`);
        if (definition.init) {
            console.log(`\tinit(context)`);
            definition.init(context);
        }
        if (definition.hooks && typeof definition.hooks === "object") {
            console.log(`\tHooks: ${Object.entries(definition.hooks).map(hook => hook[0]).join(", ")}`);
            Object.entries(definition.hooks).forEach(hook => client.on(hook[0], hook[1]));
        }
        for (const cmd of definition.commands) {
            registerCommand(cmd);
        }
        console.log(`\tLoaded commands ${definition.commands.map(cmd => `"${cmd.name}"`).join(', ')}`);
    }

    await sequelize.sync();
    console.log('Sequelize sync done, login...');
    client.login(config.token);
}).catch(err => {
    console.error('Unable to connect to the database:', err);
});
