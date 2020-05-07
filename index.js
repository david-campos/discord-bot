const config = require('./bot-config.json');
const moment = require('moment');
const Discord = require('discord.js');
const fs = require('fs');
const client = new Discord.Client();
const {Sequelize} = require('sequelize');

client.commands = new Discord.Collection();

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: 'database.sqlite'
});

/**
 * Context for the commands to receive.
 * @typedef {Object} Context
 * @property {Client} client the current discord client instance
 * @property {Sequelize} sequelize's database connection
 */
const context = {
    client: client,
    sequelize: sequelize
};

/**
 * Registers and inits the command files for the bot
 */
function registerAndInitCommands() {
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
            if (cmd) client.commands.set(cmd.name, cmd);
        }
        console.log(`\tLoaded commands ${definition.commands.map(cmd => `"${cmd.name}"`).join(', ')}`);
    }
}

/**
 * Main handler of the messages received by the bot
 * @param {Message} msg
 */
function mainMessageHandler(msg) {
    if (msg.author.bot) return;
    const withPrefix = msg.content.startsWith(config.prefix);
    if (!(withPrefix/*|| msg.mentions.has(client.user)*/)) return;
    const args = msg.content.slice(config.prefix.length).split(/ +/);
    const command = args.shift().toLowerCase();
    if (!client.commands.has(command)) {
        if (!config.silentMode) {
            msg.reply(`lo siento, pero creo que no conozco ese comando`
                + `${msg.author && msg.author.username === "jnxf" ? ", pedacísimo de perro" : ""}.`)
                .then();
        }
        return;
    }
    try {
        // May be async
        client.commands.get(command).execute(msg, args, context);
    } catch (error) {
        console.error(error);
        if (error.message && !config.silentMode) {
            msg.reply(`lo siento, ha habido un error ejecutando ese comando: ${error.message}`)
                .then();
        } else {
            msg.reply(`lo siento, ha habido un error ejecutando ese comando.`)
                .then();
        }
    }
}

async function main() {
    try {
        await sequelize.authenticate();
        // Add hook toc lose database connection
        process.on('exit', () => {
            sequelize.close()
            process.exit(0)
        })
        console.log('Connection to database has been established successfully.');

        // Discord.js event hooks
        client.on('ready', () => {console.log(`Logged in as ${client.user.tag}!`);});
        client.on('message', mainMessageHandler);

        // Moment locale configuration
        moment.locale(config.locale);

        registerAndInitCommands();

        // Syncronize models
        await sequelize.sync();
        console.log('Sequelize models sync done, login...');

        await client.login(config.token);
    } catch (err) {
        console.error(err);
    }
}

// Is async!
main().then();
