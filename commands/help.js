const {MessageEmbed} = require('discord.js');

module.exports = {
    commands: [{
        name: 'help',
        description: 'Lista los comandos',
        /**
         * @param {module:"discord.js".Message} message
         * @param {string[]} args
         * @param {Bot} context
         */
        async execute(message, args, context) {
            try {
                const fields = context.getCommandList()
                    .filter(cmd => !cmd.hidden)
                    .map(cmd => ({
                    name: context.config.prefix + cmd.name,
                    value: cmd.description
                }));
                const embed = new MessageEmbed()
                    .setTitle('Ayuda')
                    .setColor(0xffffff)
                    .addFields(fields);
                message.channel.send(embed).then();
            } catch (err) {
                message.reply('lo siento, pero no hay zorritos hoy (no mayores que tú).')
            }
        }
    }]
}
