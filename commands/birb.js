const axios = require('axios');
const {MessageEmbed} = require('discord.js');
const emoji = require('../emojis2');

module.exports = {
    commands: [{
        name: 'birb',
        shortDescription: 'Random birb',
        description: 'Returns a random birb (courtesy of some-random-api.ml)',
        /**
         * @param {module:"discord.js".Message} message
         * @param {string[]} args
         * @param {Bot} context
         */
        async execute(message, args, context) {
            try {
                const response = await axios.get("https://some-random-api.ml/img/birb");
                if (!response.data.link)
                    throw {err: "err"};
                const embed = new MessageEmbed()
                    .setTitle(`${emoji.BIRD} Here is your birb`)
                    .setColor(0x77ff77)
                    .setImage(response.data.link);
                message.channel.send(embed).then();
            } catch (err) {
                message.reply('no birbs available :(')
            }
        }
    }]
}
