const Discord = require('discord.js');
const fs = require('fs');

/**
 * @callback ExecuteCallback
 * @param {module:"discord.js".Message} msg
 * @param {string[]} args
 * @param {Bot} context
 */
/**
 * @typedef Command
 * @property {ExecuteCallback} execute
 */

class CommandManager {
    /**
     * @param {Bot} bot
     */
    constructor(bot) {
        this._bot = bot;
        this._commands = new Discord.Collection();
    }

    /**
     * @param {string} command
     * @return {Command}
     */
    resolveCommand(command)  {
        command = command.trim().toLowerCase();
        if (!this._commands.has(command)) {
            throw new Error(`lo siento, pero creo que no conozco ese comando`);
        }
        return this._commands.get(command);
    }

    /**
     * Registers and inits the command files
     * @param {string} commandsFolder
     */
    registerAndInitCommands(commandsFolder) {
        const commandFiles = fs.readdirSync(commandsFolder).filter(file => file.endsWith('.js'));
        for (const file of commandFiles) {
            console.log(`${commandsFolder}/${file}`);
            const definition = require.main.require(`${commandsFolder}/${file}`);
            if (definition.init) {
                console.log(`\tinit(context)`);
                definition.init(this._bot);
            }
            if (definition.hooks && typeof definition.hooks === "object") {
                console.log(`\tHooks: ${Object.entries(definition.hooks).map(hook => hook[0]).join(", ")}`);
                Object.entries(definition.hooks).forEach(hook => this._bot.client.on(hook[0], hook[1]));
            }
            for (const cmd of definition.commands) {
                if (cmd) this._commands.set(cmd.name, cmd);
            }
            console.log(`\tLoaded commands ${definition.commands.map(cmd => `"${cmd.name}"`).join(', ')}`);
        }
    }
}

module.exports = {CommandManager}
