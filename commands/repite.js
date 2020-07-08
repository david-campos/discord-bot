const emojis2 = require('../emojis2.js')
const {BOT_EVENTS} = require("../main/bot_events");

/** @type {Map.<string, string[]>} */
const commands = new Map();

/** @type {Command[]} */
const REPEAT_COMMANDS = [{
    name: 'repite',
    shortDescription: 'Repetir comandos',
    description: 'Repite el último comando introducido en el **canal** (no el último introducido por el usuario).',
    /**
     * @param {module:"discord.js".Message} message
     * @param {string[]} args
     * @param {Bot} context
     */
    async execute(message, args, context) {
        if (commands.has(message.channel.id)) {
            const args = commands.get(message.channel.id).slice();
            const command = args.shift();
            context.executeCommand(message, command, args);
        } else {
            message.reply(`${emojis2.THINKING_FACE} no recuerdo el último comando introducido en este canal...`)
        }
    }
}];

/**
 * @type {CommandExports}
 */
module.exports = {
    ready: function (bot) {
        bot.on(BOT_EVENTS.ON_COMMAND_RESOLVED,
            /**
             * @param {module:"discord.js".Message} msg
             * @param {string} command
             * @param {string[]} args
             * @param {Bot} context
             */
            (msg, command, args, context) => {
                if (!REPEAT_COMMANDS.map(cmd => cmd.name).includes(command)) {
                    commands.set(msg.channel.id, [command].concat(args));
                }
            }
        );
    },
    commands: REPEAT_COMMANDS
}
