const axios = require('axios');
const {MessageEmbed} = require('discord.js');

module.exports = {
    commands: [{
        name: 'zorrito',
        shortDescription: 'Zorrito aleatorio',
        description: 'Devuelve un zorrito aleatorio (cortesía de randomfox.cat)',
        /**
         * @param {module:"discord.js".Message} message
         * @param {string[]} args
         * @param {Bot} context
         */
        async execute(message, args, context) {
            try {
                const response = await axios.get("https://randomfox.ca/floof/");
                const embed = new MessageEmbed()
                    .setTitle('\ud83e\udd8a Aquí está tu zorrito')
                    .setColor(0xff7700)
                    .setImage(response.data.image);
                message.channel.send(embed).then();
            } catch (err) {
                message.reply('lo siento, pero no hay zorritos hoy (no mayores que tú).')
            }
        }
    }]
}
