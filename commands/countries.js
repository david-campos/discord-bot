const countries = require('world-countries')
const {MessageEmbed} = require('discord.js');

module.exports = {
    commands: [{
        name: 'ctr-info',
        description: 'Información sobre un país',
        hidden: true,
        /**
         * @param {module:"discord.js".Message} message
         * @param {string[]} args
         * @param {Bot} context
         */
        execute(message, args, context) {
            if (args.length === 0) {
                message.reply('no country');
                return;
            }
            /**
             * @type {Country|null}
             */
            let country = null;
            if (args[0].length === 2) {
                const code = args[0].toUpperCase();
                country = countries.find(c => c.cca2 === code);
            }
            if (!country && args[0].length === 3) {
                const code = args[0].toUpperCase();
                if (/^[0-9]+$/.test(code)) {
                    country = countries.find(c => c.ccn3 === code);
                } else {
                    country = countries.find(c => c.cca3 === code);
                }
            }
            if (!country) {
                const f = x => x.toLowerCase().normalize("NFD").replace(/[^A-Za-z]+/g, '');
                const normalized = f(args[0]);
                country = countries.find(c => f(c.name.common) === normalized || f(c.name.official) === normalized)
                    || countries.find(c => c.altSpellings.find(s => f(s) === normalized) !== undefined)
                    || countries.find(c =>
                        Object.values(c.translations).find(
                            t => f(t.official) === normalized || f(t.common) === normalized
                        ) !== undefined
                    );
            }
            if (country === null) {
                message.reply('country not found');
                return;
            }
            const embed = new MessageEmbed()
                .setTitle(country.flag + " " + (country.translations.spa ? country.translations.spa.common : country.name.common))
                .setColor(0xaaaaaa)
                .setDescription(`\`\`\`${JSON.stringify(country)}\`\`\``);
            message.channel.send(embed).then();
        }
    }]
};
