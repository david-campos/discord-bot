const {CommandManager} = require("./command_manager");
const {MessageReceptionLock} = require("./msg_reception_lock");
const {CommandParser} = require("./command_parser");
const Discord = require('discord.js');
const {apelativoRandom} = require("./apelativos");
const emoji = require("../emojis2");
const {Sequelize} = require('sequelize');
const EventEmitter = require('events');
const {Logger} = require("../logging/logger");
const {BOT_EVENTS} = require("./bot_events");

const path = require('path');
const {pickRandomElement} = require("../generic/array");
const logger = new Logger(path.basename(__filename, '.js'));

/**
 * @typedef BotConfiguration
 * @property {string} prefix - prefix for commands recognition
 * @property {boolean} silentMode - silent mode enabled
 * @property {string} token - token for the discord client to login
 * @property {string} commandsFolder - folder to find the commands to load
 * @property {boolean} logDb - whether to make log of the database operations or not
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
            storage: 'database.sqlite',
            logging: config.logDb ? logger.log.bind(logger) : false
        });

        this._commandMgr = new CommandManager(this);
        this._commandParser = new CommandParser(this.config);
        this._receptionLock = new MessageReceptionLock();
        this._events = new EventEmitter();
    }

    async init() {
        try {
            await this.sequelize.authenticate();
            // Add hook toc lose database connection
            process.on('exit', () => {
                this.sequelize.close()
                process.exit(0)
            })
            logger.log('Connection to database has been established successfully.');

            // Discord.js event hooks
            this.client.on('ready', () => {
                logger.log(`Logged in as ${this.client.user.tag}!`);
            });
            this.client.on('message', this.onMessage.bind(this));
            this.client.on('disconnect', (err) => {
                console.error('DISCONECTED', err);
                this.client.connect();
            });

            this._commandMgr.registerAndInitCommands(this.config.commandsFolder);

            // Syncronize models
            await this.sequelize.sync({alter: true});
            logger.log('Sequelize models sync done, login...');

            await this.client.login(this.config.token);
        } catch (err) {
            logger.error(err);
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
        if (!(withPrefix)) {
            if (msg.mentions.has(this.client.user)) {
                this.specialAnswer(msg);
            }
            return;
        }
        const [command, args] = this._commandParser.parse(msg);
        this._events.emit(BOT_EVENTS.ON_COMMAND_PARSED, msg, command, args, this);
        this.executeCommand(msg, command, args);
    }

    executeCommand(msg, command, args) {
        try {
            const commandInstance = this._commandMgr.resolveCommand(command);
            logger.log(`Command ${command}${args.length > 0 ? `(${args.map(arg => `"${arg}"`).join(', ')})` : ''}`);
            this._events.emit(BOT_EVENTS.ON_COMMAND_RESOLVED, msg, command, args, this);
            try {
                // May be async
                commandInstance.execute(msg, args, this);
            } catch (error) {
                logger.error(error);
                if (error.message && !config.silentMode) {
                    msg.reply(`lo siento, ha habido un error ejecutando ese comando: ${error.message}`)
                        .then();
                } else {
                    msg.reply(`lo siento, ha habido un error ejecutando ese comando.`)
                        .then();
                }
            }
        } catch (error) {
            logger.log(`Unknown command ${command}`);
            if (!this.config.silentMode) {
                msg.reply(`a ver, ${apelativoRandom()}, no conozco el comando "${command}"...\n`
                    +`Quizás quisiste decir: ${this.didYouMean(command).slice(0, 3).map(w => `\`${w}\``).join(', ')}`)
                    .then(); // Ignore
            }
        }
    }

    on(event, callback) {
        this._events.on(event, callback);
    }

    /**
     * @param {Message} msg
     */
    specialAnswer(msg) {
        const lower = msg.content.toLowerCase();
        if (lower.includes('gracias')) {
            msg.reply(`de nada, ${apelativoRandom()} ${emoji.SMILING_FACE}`).then();
        } else if (lower.includes('ol')) {
            const saludos = ["buenas", "qué tal", "holi", "hola", "hey", "sup"];
            const saludo = saludos[Math.round(Math.random() * (saludos.length - 1))];
            msg.reply(`${saludo}, ${apelativoRandom()}!`).then();
        } else if (lower.includes('b') && lower.includes('noc')) {
            const despedidas = ["buenas noches", "que sueñes con angelitos", "duerme bien", "descansa",
                "no dejes que te muerdan las chinches", "dulces sueños"];
            const despedida = despedidas[Math.round(Math.random() * (despedidas.length - 1))];
            msg.reply(`${despedida}, ${apelativoRandom()}!`).then();
        } else if (lower.includes('te fo')) {
            const part1 = ["ven aquí", "y yo a ti", "quita de ahí", "fumando espero, al hombre que yo quiero",
                "dale"];
            msg.reply(`${pickRandomElement(part1)}, ${apelativoRandom()}`).then();
        } else {
            msg.reply(`no sé qué decirte, ${apelativoRandom()}, ¿por qué no pruebas \`${this.config.prefix}ayuda\`?`).then();
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

    /**
     * @returns {Command[]}
     */
    getCommandList() {
         return this._commandMgr.getCommandList();
    }

    /**
     * @param {string} command
     * @return {string[]}
     */
    didYouMean(command) {
        return this._commandMgr.didYouMean(command);
    }
}

module.exports = {Bot}
