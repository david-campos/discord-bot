const {MessageEmbed} = require('discord.js');
const config = require('../bot-config.json');
const {apelativoRandom} = require("../main/apelativos");

const PAGE_SIZE = 24;

/**
 * @param {CommandArgumentDefinition} arg
 */
function argumentDefinition(arg) {
    if (Array.isArray(arg)) {
        return arg.map(argumentDefinition).join(' ');
    } else if ('group' in arg) {
        switch (arg.group) {
            case 'choice':
                return `${arg.optional ? '[' : '{'}${arg.args.map(argumentDefinition).join('|')}${arg.optional ? ']' : '}'}`;
            default:
                return '*%error: unknown group%*'; // Shouldn't happen
        }
    } else {
        const nonLiteral = arg.isLiteral ? '**' : '';
        const [optLft, optRight] = arg.optional ? ['[', ']'] : ['', ''];
        const defVal = 'defaultValue' in arg ? `=${arg.defaultValue}` : '';
        return `${nonLiteral}${optLft}${arg.name}${defVal}${optRight}${nonLiteral}`;
    }
}

/**
 * @param {CommandArgumentDefinition} arg
 * @param {number} tabLevel
 * @return {string}
 */
function argumentUsage(arg, tabLevel) {
    if (Array.isArray(arg)) {
        return arg.map(val => argumentUsage(val, tabLevel)).join('\n');
    } else if ('group' in arg) {
        switch (arg.group) {
            case 'choice':
                return argumentUsage(arg.args, tabLevel);
            default:
                return '*%error: unknown group%*'; // Shouldn't happen
        }
    } else {
        const tabs = tabLevel > 0 ? `${new Array(2 * tabLevel).fill(' ').join('')} ` : '';
        const tabs_more = `${new Array(2 * (tabLevel + 1)).fill(' ').join('')} `;
        const lines = [`${tabs}**${arg.name}**${arg.optional ? ' *(opcional)*' : ''}: ${arg.description}`];
        if (arg.format) lines.push(`${tabs_more}Formato: ${arg.format}`);
        if (arg.defaultValue) lines.push(`${tabs_more}Por defecto: ${arg.defaultValue}`)
        return lines.join('\n');
    }
}

/**
 * @param {Command} command
 * @return {module:"discord.js".EmbedFieldData[]}
 */
function usageDescription(command) {
    if (command.usage.length === 0) return [];
    const hasSubcommands = typeof command.usage[0].subcommand === 'string';
    if (hasSubcommands && command.usage.find(u => typeof u.subcommand !== 'string')) {
        // noinspection JSValidateTypes
        return [{name: 'Error in command definition', value: 'Mixed subcommands and definitions'}];
    }
    const fields = [];
    const completeDefinition = definition =>
        `***${config.prefix}${command.name}**${definition ? ` ${definition}` : ''}*`;
    /**
     * @type {{name: string, value: string}[]}
     */
    if (hasSubcommands) {
        /** @param {SubcommandDefinition} subcommand */
        fields.push(...command.usage.map(subcommand => {
            const definition = completeDefinition(argumentDefinition(subcommand.args));
            const lines = [definition, subcommand.description];
            if (subcommand.args.length !== 1 || !subcommand.args[0].isLiteral) {
                lines.push('Detalles:');
                lines.push(argumentUsage(subcommand.args, 1));
            }
            return {
                name: subcommand.subcommand,
                value: lines.join('\n')
            };
        }));
    } else {
        const definition = completeDefinition(argumentDefinition(command.usage));
        fields.push(...[
            {name: "Uso", value: definition},
            {name: "Detalles", value: argumentUsage(command.usage, 0)}
        ]);
    }
    // noinspection JSValidateTypes
    return fields;
}


module.exports = {
    commands: [{
        name: 'ayuda',
        shortDescription: 'Ayuda',
        description: 'Muestra una descripción de todos los comandos del bot.',
        usage: [{
            group: 'choice', args: [
                {
                    name: 'pag', description: 'indica la página de ayuda que quieres ver', optional: true,
                    format: 'entero mayor que 1', defaultValue: '1'
                },
                {
                    name: 'comando', description: 'indica un comando para el que obtener una descripción detallada',
                    format: 'nombre del comando'
                }
            ]
        }],
        /**
         * @param {module:"discord.js".Message} message
         * @param {string[]} args
         * @param {Bot} context
         */
        async execute(message, args, context) {
            try {
                if (args.length === 0 || /[0-9]+/.test(args[0])) {
                    const page = args.length === 0 ? 1 : parseInt(args[0], 10);
                    if (page < 1) {
                        message.reply(`página inválida, ${apelativoRandom()}`).then();
                        return;
                    }
                    const pageIdx = page - 1;
                    const allCommands = context.getCommandList().filter(cmd => !cmd.hidden);
                    const pages = Math.ceil(allCommands.length / PAGE_SIZE);
                    const pageTitle = pages > 1 ? ` (pág. ${page}/${pages})` : '';
                    const pageDescr = pages > 1 ?
                        `Usa \`${config.prefix}ayuda pagina\` para mostrar la página 'pagina'.\n` : '';
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
                            `${pageDescr}Usa \`${config.prefix}ayuda comando\` para un 'comando' dado para más información sobre su uso.`)
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
                        if (Array.isArray(command.usage)) {
                            fields.push(...usageDescription(command));
                        }
                        const embed = new MessageEmbed()
                            .setTitle(`Ayuda para ${context.config.prefix}${command.name}`)
                            .setColor(0xffffff)
                            .addFields(fields);
                        message.channel.send(embed).then();
                    } else {
                        message.reply(`${args[0]}? WTF? No conozco ese comando, ${apelativoRandom()}.\n`
                            + `Quizás quisiste decir: ${context.didYouMean(args[0]).slice(0, 5).map(w => `\`${w}\``).join(', ')}`);
                    }
                }
            } catch (err) {
                console.error(err);
                message.reply('no puc.')
            }
        }
    }]
}
