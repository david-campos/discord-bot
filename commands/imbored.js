const axios = require('axios');
const {MessageEmbed} = require('discord.js');

const MONEY = "\ud83d\udcb8";
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
const ACCESSIBILITY = [
    "\ud83d\udfe2", "\ud83d\udfe1", "\ud83d\udfe0", "\ud83d\udd34"
];

module.exports = {
    commands: [{
        name: 'imbored',
        description: 'Devuelve una actividad aleatoria para hacer (en inglés, cortesía de boredapi.com)',
        /**
         * @param {module:"discord.js".Message} message
         * @param {string[]} args
         * @param {Bot} context
         */
        async execute(message, args, context) {
            const params = {};
            {
                const valid = args.filter(arg => !isNaN(arg) && parseInt(arg, 10) > 0);
                if (valid.length > 0) params.participants = valid[0];
            }

            try {
                const response = await axios.get("http://www.boredapi.com/api/activity", {params: params});
                const moneyIcon =
                    response.data.price === '' || parseFloat(response.data.price) === 0 ? "\ud83c\udd93" :
                    new Array(Math.round(response.data.price * 2) + 1).fill(MONEY).join("");
                const accIndex = Math.round(response.data.accessibility * (ACCESSIBILITY.length - 1));
                const embed = new MessageEmbed()
                    .setTitle(`${TYPES[response.data.type]} ${response.data.activity}`)
                    .setColor(0x123456)
                    .setDescription(
                        `Cost: ${moneyIcon}\n` +
                        `Accessibility: ${ACCESSIBILITY[accIndex]}\n` +
                        `Participants: ${response.data.participants}`
                    );
                message.channel.send(embed).then();
            } catch (err) {
                message.reply('lo siento, pero no hay zorritos hoy (no mayores que tú).')
            }
        }
    }]
}
