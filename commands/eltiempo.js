const moment = require('moment');
const {MessageEmbed} = require('discord.js');

const LOCALES = ["af", "ar-dz", "ar-kw", "ar-ly", "ar-ma", "ar-sa", "ar-tn", "ar", "az", "be", "bg", "bm", "bn", "bo", "br", "bs", "ca", "cs", "cv", "cy", "da", "de-at", "de-ch", "de", "dv", "el", "en-au", "en-ca", "en-gb", "en-ie", "en-nz", "eo", "es-do", "es-us", "es", "et", "eu", "fa", "fi", "fo", "fr-ca", "fr-ch", "fr", "fy", "gd", "gl", "gom-latn", "gu", "he", "hi", "hr", "hu", "hy-am", "id", "is", "it", "ja", "jv", "ka", "kk", "km", "kn", "ko", "ky", "lb", "lo", "lt", "lv", "me", "mi", "mk", "ml", "mr", "ms-my", "ms", "mt", "my", "nb", "ne", "nl-be", "nl", "nn", "pa-in", "pl", "pt-br", "pt", "ro", "ru", "sd", "se", "si", "sk", "sl", "sq", "sr-cyrl", "sr", "ss", "sv", "sw", "ta", "te", "tet", "th", "tl-ph", "tlh", "tr", "tzl", "tzm-latn", "tzm", "uk", "ur", "uz-latn", "uz", "vi", "x-pseudo", "yo", "zh-cn", "zh-hk", "zh-tw"];

module.exports = {
    commands: [{
        name: 'eltiempo',
        shortDescription: 'Hora actual',
        description: 'Hora actual en ESPAÑA.',
        usage: [{
            name: 'locale', optional: true,
            description: 'código del locale a emplear para formatear la fecha y hora',
            format: `uno de estos: ${LOCALES.join(', ')}`,
            defaultValue: moment.locale()
        }],
        /**
         * @param {module:"discord.js".Message} message
         * @param {string[]} args
         * @param {Bot} context
         */
        execute(message, args, context) {
            const loc = args && typeof args[0] === "string" ? args[0] : moment.locale();
            const embed = new MessageEmbed()
                .setTitle('Aquest és **EL TEMPS**:')
                .setColor(Math.random() * 0xffffff)
                .setDescription(moment().locale(loc).format('LLLL'));
            message.channel.send(embed).then();
        }
    }]
};
