const Discord = require('discord.js');
const fs = require('fs');
const levenshtein = require('js-levenshtein');

const path = require('path');
const {Logger} = require("../logging/logger");
const logger = new Logger(path.basename(__filename, '.js'));

/**
 * @callback ExecuteCallback
 * @param {module:"discord.js".Message} msg
 * @param {string[]} args
 * @param {Bot} context
 */

/**
 * @typedef CommandArgumentDefinitionGroup
 * @property {'choice'} group
 * @property {boolean} [optional] - whether the command is optional, by default we should assume it is not
 * @property {CommandArgumentDefinition[]} args - arguments inside
 */

/**
 * @typedef CommandSpecificArgumentDefinition
 * @property {string} name - name to display for the property
 * @property {string} description - description for the property
 * @property {string} [format] - format description for the argument
 * @property {boolean} [optional] - whether the command is optional, by default we should assume it is not
 * @property {string} [defaultValue] - default value for the property if omitted
 * @property {boolean} [isLiteral] - true if the command must be written exactly as in the name
 */

/**
 * @typedef {CommandSpecificArgumentDefinition|CommandArgumentDefinitionGroup} CommandSingleArgumentDefinition
 */
/**
 * @typedef {CommandSingleArgumentDefinition|CommandSingleArgumentDefinition[]} CommandArgumentDefinition
 */
/**
 * @typedef {{subcommand: string, description: string, args: CommandArgumentDefinition}} SubcommandDefinition
 */

/**
 * @typedef Command
 * @property {ExecuteCallback} execute
 * @property {string} name
 * @property {string} [description] - if not deffined, short description should be always used
 * @property {string} shortDescription
 * @property {SubcommandDefinition[]|CommandArgumentDefinition[]} [usage]
 * @property {boolean} [hidden]
 */

/**
 * @typedef CommandExports
 * @property {function(Bot): void} [init]
 * @property {function(Bot): void} [ready]
 * @property {Object.<string, function>} hooks
 * @property {Command[]} commands
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
            logger.log(`${commandsFolder}/${file}`);
            /**
             * @type {CommandExports}
             */
            const definition = require.main.require(`${commandsFolder}/${file}`);
            if (definition.init) {
                logger.log(`\tinit(context)`);
                definition.init(this._bot);
            }
            if (definition.ready) {
                logger.log('\tready(context)');
                this._bot.client.on('ready', definition.ready.bind(null, this._bot));
            }
            if (definition.hooks && typeof definition.hooks === "object") {
                logger.log(`\tHooks: ${Object.entries(definition.hooks).map(hook => hook[0]).join(", ")}`);
                Object.entries(definition.hooks).forEach(hook => this._bot.client.on(hook[0], hook[1]));
            }
            for (const cmd of definition.commands) {
                if (cmd) this._commands.set(cmd.name, cmd);
            }
            logger.log(`\tLoaded commands ${definition.commands.map(cmd => `"${cmd.name}"`).join(', ')}`);
        }
    }

    /**
     * @returns {Command[]}
     */
    getCommandList() {
        return this._commands.array();
    }

    /**
     * Given an inteneded command gives the command list sorted by "distance" (closest to farthest)
     * @param {string} command
     * @return {string[]}
     */
    didYouMean(command) {
        const allCommands = this.getCommandList().filter(cmd => !cmd.hidden).map(c => c.name);
        const splittedCommand = command.split('-');
        const dist = word => {
            const subw = word.split('-');
            return splittedCommand
                .map(w => Math.min(...subw.map(c => levenshtein(c, w))))
                .reduce((p, c) => p + c);
        };
        allCommands.sort((a, b) => {
            const distA = dist(a);
            const distB = dist(b);
            if (distA !== distB) return distA - distB;
            else return a.localeCompare(b);
        });
        return allCommands;
    }
}

module.exports = {CommandManager}
