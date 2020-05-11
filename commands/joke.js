const axios = require('axios');
const {MessageEmbed} = require('discord.js');

const TYPES = {
    "education": "\ud83c\udf93",
    "recreational": "\ud83d\udcfa",
    "social": "\ud83d\ude42",
    "diy": "\ud83d\udee0",
    "charity": "\ud83e\udd1d",
    "cooking": "\ud83c\udf73",
    "relaxation": "\u2668",
    "music": "\ud83c\udfb6",
    "busywork": "\u23f3"
};

module.exports = {
    commands: [{
        name: 'joke',
        description: 'Cuenta un chiste (en inglés, cortesía de APIJoke)',
        /**
         * @param {module:"discord.js".Message} message
         * @param {string[]} args
         * @param {Bot} context
         */
        async execute(message, args, context) {
            try {
                const response = await axios.get("https://official-joke-api.appspot.com/jokes/random");
                // if (response.data.type === 'twopart') {
                await message.channel.send(response.data.setup);
                setTimeout(() => message.channel.send(response.data.punchline).then(),
                    2500);
                // } else {
                //     await message.channel.send(response.data.joke);
                // }
            } catch (err) {
                message.reply('lo siento, pero no hay chistes disponibles.')
            }
        }
    }]
}
