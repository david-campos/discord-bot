const {MessageEmbed} = require('discord.js');
const config = require('../bot-config.json');

const PAGE_SIZE = 25;

/**
 * @param {CommandArgumentDefinition} arg
 */
function argumentDefinition(arg) {
    if ('group' in arg) {
        switch (arg.group) {
            case 'choice':
                return `${arg.optional ? '[' : '{'}${arg.args.map(argumentDefinition).join('|')}${arg.optional ? ']' : '}'}`;
            default:
                return '*%error: unknown group%*'; // Shouldn't happen
        }
    } else {
        const nonLiteral = arg.isLiteral ? '' : '**';
        const [optLft, optRight] = arg.optional ? ['[', ']'] : ['', ''];
        const defVal = 'defaultValue' in arg ? `=${arg.defaultValue}` : '';
        return `${nonLiteral}${optLft}${arg.name}${defVal}${optRight}${nonLiteral}`;
    }
}

/**
 * @param {Command} command
 * @return {module:"discord.js".EmbedFieldData}
 */
function usageDescription(command) {
    return {
        name: "Uso",
        value: `*${config.prefix}${command.name} ${command.usage.map(argumentDefinition).join(" ")}*\n`
            + command.usage
                // flat groups
                .reduce((p, arg) => 'group' in arg ? p.concat(arg.args) : arg, [])
                .map(arg =>
                    `\`    \`**${arg.name}**${arg.optional ? ' *(opcional)*' : ''}: ${arg.description}`
                    + (arg.format ? `\n\`        \`Formato: ${arg.format}` : '')
                    + (arg.defaultValue ? `\n\`        \`Valor por defecto: ${arg.defaultValue}` : '')
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
                if (args.length === 0 || !isNaN(parseInt(args[0], 10))) {
                    const page = args.length === 0 ? 1 : parseInt(args[0], 10);
                    if (page < 1) {
                        message.reply('invalid page').then();
                        return;
                    }
                    const pageIdx = page - 1;
                    const allCommands = context.getCommandList().filter(cmd => !cmd.hidden);
                    const pages = Math.ceil(allCommands.length / PAGE_SIZE);
                    const pageTitle = pages > 1 ? ` (pág. ${page}/${pages})` : '';
                    const pageDescr = pages > 1 ?
                        `Usa \`${config.prefix}help pagina\` para mostrar la página 'pagina'.\n` : '';
                    const fields = allCommands
                        .filter((v, idx) => Math.floor(idx / PAGE_SIZE) === pageIdx)
                        .map(cmd => ({
                            name: context.config.prefix + cmd.name,
                            value: cmd.shortDescription,
                            inline: true
                        }));
                    const embed = new MessageEmbed()
                        .setTitle(`Lista de comandos${pageTitle}`)
                        .setColor(0xffffff)
                        .setDescription(
                            `${pageDescr}Usa \`${config.prefix}help comando\` para un 'comando' dado para más información sobre su uso.`)
                        .addFields(fields);
                    message.channel.send(embed).then();
                } else {
                    const key = args[0].startsWith(config.prefix) ? args[0].substring(1) : args[0];
                    const command = context.getCommandList().find(cmd => cmd.name === key);
                    if (command) {
                        /** @type {module:"discord.js".EmbedFieldData[]} */
                        const fields = [
                            {name: 'Descripción', value: command.description || command.shortDescription}
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
