const {MessageEmbed} = require('discord.js');

module.exports = {
    commands: [{
        name: 'qr',
        description: 'Devuelve la URL indicada como QR (cortesía de qrtag.net)',
        /**
         * @param {module:"discord.js".Message} message
         * @param {string[]} args
         * @param {Bot} context
         */
        async execute(message, args, context) {
            if (args.length > 0) {
                const url = args.join();
                const embed = new MessageEmbed()
                    .setTitle('\ud83d\udd17 Aquí lo tienes')
                    .setColor(0xffffff)
                    .setImage(`https://qrtag.net/api/qr.png?url=${encodeURIComponent(url)}`);
                message.channel.send(embed).then();
            }
        }
    }]
}
