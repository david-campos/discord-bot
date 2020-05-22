const {MessageEmbed} = require('discord.js');
const config = require('../bot-config.json');

/**
 * @param {Command} command
 * @return {module:"discord.js".EmbedFieldData}
 */
function usageDescription(command) {
    return {
        name: "Uso",
        value: `*${config.prefix}${command.name} ${command.usage.map(arg =>
                `**${arg.optional ? '[' : ''}${arg.name}${arg.defaultValue !== undefined ? `=${arg.defaultValue}` : ''}${arg.optional ? ']' : ''}**`
            ).join(" ")}*\n`
            + command.usage.map(arg =>
                `\`    \`**${arg.name}**${arg.optional ? ' *(opcional)*' : ''}: ${arg.description}`
                + (arg.format ? `\n\`        \`Formato: ${arg.format}` : '')
                + (arg.defaultValue ? `\n\`        \`Valor por defecto: ${arg.defaultValue}`: '')
            ).join("\n")
    };
}

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
                if (args.length === 0) {
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
                } else {
                    const command = context.getCommandList().find(cmd => cmd.name === args[0]);
                    if (command) {
                        /** @type {module:"discord.js".EmbedFieldData[]} */
                        const fields = [
                            {name: 'Descripción', value: command.description}
                        ];
                        if (command.usage) {
                            fields.push(usageDescription(command));
                        }
                        const embed = new MessageEmbed()
                            .setTitle(`Ayuda para ${context.config.prefix}${command.name}`)
                            .setColor(0xffffff)
                            .addFields(fields);
                        message.channel.send(embed).then();
                    } else {
                        message.reply(`${args[0]}? WTF? No conozco ese comando, pelma.`);
                    }
                }
            } catch (err) {
                console.error(err);
                message.reply('no puc.')
            }
        }
    }]
}
