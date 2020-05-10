const {CommandManager} = require("./command_manager");
const {MessageReceptionLock} = require("./msg_reception_lock");
const {CommandParser} = require("./command_parser");
const Discord = require('discord.js');
const {Sequelize} = require('sequelize');

/**
 * @typedef BotConfiguration
 * @property {string} prefix - prefix for commands recognition
 * @property {boolean} silentMode - silent mode enabled
 * @property {string} token - token for the discord client to login
 * @property {string} commandsFolder - folder to find the commands to load
 */

/**
 * @class Bot
 * @property {module:"discord.js".Client} client
 * @property {BotConfiguration} config
 * @property {Sequelize} sequelize
 */
class Bot {
    /**
     * Bot configuration
     * @param {BotConfiguration} config
     */
    constructor(config) {
        this.client = new Discord.Client();
        this.config = config;
        this.sequelize = new Sequelize({
            dialect: 'sqlite',
            storage: 'database.sqlite'
        });

        this._commandMgr = new CommandManager(this);
        this._commandParser = new CommandParser(this.config);
        this._receptionLock = new MessageReceptionLock();
    }

    async init() {
        try {
            await this.sequelize.authenticate();
            // Add hook toc lose database connection
            process.on('exit', () => {
                this.sequelize.close()
                process.exit(0)
            })
            console.log('Connection to database has been established successfully.');

            // Discord.js event hooks
            this.client.on('ready', () => {
                console.log(`Logged in as ${this.client.user.tag}!`);
            });
            this.client.on('message', this.onMessage.bind(this));

            this._commandMgr.registerAndInitCommands(this.config.commandsFolder);

            // Syncronize models
            await this.sequelize.sync();
            console.log('Sequelize models sync done, login...');

            await this.client.login(this.config.token);
        } catch (err) {
            console.error(err);
        }
    }

    /**
     * @param {module:"discord.js".Message} msg
     */
    onMessage(msg) {
        const lockCallback = this._receptionLock.getLock(msg);
        if (lockCallback) {
            lockCallback(msg, this);
            return;
        }

        if (msg.author.bot) return;

        const withPrefix = msg.content.startsWith(this.config.prefix);
        if (!(withPrefix/*|| msg.mentions.has(client.user)*/)) return;
        const [command, args] = this._commandParser.parse(msg);

        try {
            const commandInstance = this._commandMgr.resolveCommand(command);
            try {
                // May be async
                commandInstance.execute(msg, args, this);
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
        } catch (error) {
            if (!this.config.silentMode) {
                msg.reply(`no conozco el comando "${command}"`)
                    .then(); // Ignore
            }
        }
    }

    /**
     * @param {DiscordChannel} channel
     * @param {LockCallback} callback
     */
    lockMessageReception(channel, callback) {
        this._receptionLock.lockMessageReception(channel, callback);
    }

    /**
     * @param {DiscordChannel} channel
     */
     unlockMessageReception(channel) {
        this._receptionLock.unlockMessageReception(channel);
    }
}

module.exports = {Bot}