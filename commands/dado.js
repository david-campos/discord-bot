const {MessageEmbed} = require('discord.js');
const emoji = require('../emojis2');

const NUMBERS = [':zero:', ':one:', ':two:', ':three:', ':four:', ':five:', ':six:', ':seven:', ':eight:', ':nine:'];
const CHAR_ZERO = "0".charCodeAt(0);

module.exports = {
    commands: [{
        name: 'dado',
        shortDescription: 'Lanza un dado',
        description: 'Lanza un dado. Si no se indica el número de caras, el número es 6.',
        usage: [{
            name: 'caras',
            description: 'Número de caras del dado.',
            optional: true,
            defaultValue: '6'
        }],
        /**
         * @param {module:"discord.js".Message} message
         * @param {string[]} args
         * @param {Bot} context
         */
        async execute(message, args, context) {
            let faces = 6;
            if (/[1-9][0-9]*/.test(args[0])) {
                faces = parseInt(args[0], 10);
            }
            const chosen = Math.round(Math.random() * (faces - 1)) + 1;
            const str = chosen.toString(10);
            let result = "";
            for (let i = 0; i < str.length; ++i) {
                result += NUMBERS[str.charCodeAt(i) - CHAR_ZERO];
            }
            const embed = new MessageEmbed()
                .setTitle(`${emoji.GAME_DIE} ${result}`)
                .setDescription(`Dado de ${faces} caras lanzado.`)
                .setColor(0xee6510);
            message.channel.send(embed).then();
        }
    }]
}
