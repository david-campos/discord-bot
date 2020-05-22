const axios = require('axios');
const moment = require('moment');
const {MessageEmbed} = require('discord.js');
const emojiFlags = require('country-flag-emoji');

module.exports = {
    commands: [{
        name: 'festivos',
        shortDescription: 'Próximos festivos',
        description: 'Devuelve los próximos festivos a nivel mundial o para el país con el código indicado (cortesía de date.nager.at)',
        usage: [{
            group: 'choice', args: [
                {
                    name: 'N',
                    description: 'número de festivos a mostrar',
                    format: 'entero mayor que cero',
                    optional: true,
                    defaultValue: '1'
                },
                {name: 'countryCode', description: 'código de país', format: 'dos letras'}
            ]
        }],
        /**
         * @param {module:"discord.js".Message} message
         * @param {string[]} args
         * @param {Bot} context
         */
        async execute(message, args, context) {
            let country = undefined;
            let max = 1;
            for (let arg of args) {
                if (!isNaN(arg) && parseInt(arg, 10) >= 1) {
                    max = parseInt(arg, 10);
                } else if (arg.match(/^[A-Z]{2}$/i)) {
                    country = arg;
                }
            }
            try {
                let response;
                if (country) {
                    response = await axios.get(`https://date.nager.at/Api/v2/NextPublicHolidays/${country.toUpperCase()}`);
                } else {
                    response = await axios.get("https://date.nager.at/Api/v2/NextPublicHolidaysWorldwide");
                }
                for (let i = 0; i < max && i < response.data.length; i++) {
                    const holiday = response.data[i];
                    const embed = new MessageEmbed()
                        .setTitle(`🎉 ${holiday.localName} (${holiday.name})`)
                        .setDescription(`${moment(holiday.date, "YYYY-MM-DD").format('LL')}, ` +
                            `festivo en ${emojiFlags.get(holiday.countryCode).emoji}`)
                    await message.channel.send(embed).then();
                }
            } catch (err) {
                message.reply('no he podido obtener los festivos, quin fàstic.')
            }
        }
    }]
}
