const axios = require('axios');
const {MessageEmbed} = require('discord.js');
const emoji = require('../emojis2');

module.exports = {
    commands: [{
        name: 'nosi',
        shortDescription: 'Haz una pregunta de sí o no.',
        description: 'Haz una pregunta de sí o no y obtén tu respuesta.',
        /**
         * @param {module:"discord.js".Message} message
         * @param {string[]} args
         * @param {Bot} context
         */
        async execute(message, args, context) {
            try {
                const response = await axios.get("https://yesno.wtf/api/");
                const embed = new MessageEmbed()
                    .setTitle(`${emoji.CRYSTAL_BALL} ${args.join(" ")}`)
                    .setDescription(`La respuesta es: **${response.data.answer === 'yes' ? 'sí' : 'no'}**.`)
                    .setColor(response.data.answer === 'yes' ? 0x74e987 : 0xe97487)
                    .setImage(response.data.image);
                message.channel.send(embed).then();
            } catch (err) {
                message.reply('me es desconocido incluso a mí.')
            }
        }
    }]
}
