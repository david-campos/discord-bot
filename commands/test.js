const emoji = require('../emojis2');

module.exports = {
    commands: [{
        name: 'test',
        hidden: true,
        shortDescription: 'Comando secreto de testear cosas.',
        description: `No deberías conocer esto, LARGO! ${emoji.ANGRY_FACE}`,
        /**
         * @param {module:"discord.js".Message} message
         * @param {string[]} args
         * @param {Bot} context
         */
        async execute(message, args, context) {
            args.forEach(arg => console.log(
                `"${arg}"`,
                /^\p{Emoji}+$/u.test(arg) || (/\p{Emoji}/u.test(arg) && Object.values(emoji).includes(arg))
            ));
        }
    }]
}
