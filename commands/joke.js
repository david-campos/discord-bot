const axios = require('axios');

module.exports = {
    commands: [{
        name: 'joke',
        shortDescription: 'Chiste (en inglés)',
        description: 'Cuenta un chiste (en inglés, cortesía de official-joke-api.appspot.com)',
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
