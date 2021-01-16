const {MessageEmbed} = require('discord.js');
const emoji = require('../emojis2');
const {apelativoRandom} = require("../main/apelativos");

/**
 * @param {{text: string}} obj
 */
function getNext(obj) {
    if (!obj.text) return undefined;
    obj.text = obj.text.trim();
    const text = obj.text;
    const escaped = [`'`, `"`].includes(text[0]) ? text[0] : null;
    if (!escaped) {
        const idx = text.indexOf(" ");
        obj.text = idx < 0 || idx === text.length - 1 ? undefined : text.substring(idx + 1);
        return text.substr(0, idx < 0 ? text.length : idx);
    }
    let lastWasEscape = false;
    let i;
    for (i = 1; i < text.length; ++i) {
        const char = text[i];
        if (!lastWasEscape && [`'`, `"`].includes(char)) {
            break;
        }
        lastWasEscape = (char === "\\");
    }
    obj.text = text.slice(i + 1);
    return text.slice(1, i);
}

module.exports = {
    commands: [{
        name: 'encuesta',
        shortDescription: 'Hace una encuesta',
        description: 'Hace una encuesta con un máximo de 10 respuestas posibles que dura 30 segundos.',
        usage: [
            {
                name: 'duracion',
                description: 'Duración de la encuesta, debe estar entre 10 segundos y 15 minutos.',
                optional: true,
                format: '15s/m',
                defaultValue: '30s'
            }, {
                name: 'pregunta',
                description: 'Puedes entrecomillar la pregunta para poder usar espacios.',
                format: '"Cómo introduzco la pregunta?"'
            }, {
                name: 'respuestas',
                description: 'Al menos dos y hasta diez respuestas separadas por espacios. Puedes entrecomillar las respuestas para poder usar espacios en ellas.',
                format: '"Respuesta 1" "Respuesta 2" Respuesta3'
            }
        ],
        /**
         * @param {module:"discord.js".Message} message
         * @param {string[]} args
         * @param {Bot} context
         */
        async execute(message, args, context) {
            const obj = {text: args.join(" ")};
            let seconds = 30;
            let question = getNext(obj);
            const isTime = question && question.match(/^([1-9][0-9]*)([ms])$/);
            if (isTime) {
                const num = parseInt(isTime[1], 10) * (isTime[2] === 'm' ? 60 : 1);
                if (num < 10 || num > 15 * 60) {
                    message.reply(question + ' no es un tiempo válido (debe durar entre 10 segundos y 15 minutos).');
                    return;
                }
                seconds = num;
                question = getNext(obj);
            }
            if (!question) {
                message.reply(`especifica una pregunta y al menos dos respuestas, ${apelativoRandom()}.`).then();
                return;
            }
            const answers = [];
            while (obj.text) {
                answers.push(getNext(obj));
            }
            if (answers.length < 2) {
                message.reply(`necesito al menos dos respuestas, ${apelativoRandom()}.`).then();
            } else if (answers.length > 10) {
                message.reply(`más de diez respuestas no manejo, ${apelativoRandom()}.`).then();
            } else {
                const emojis = ['\u0031\ufe0f\u20e3', '\u0032\ufe0f\u20e3', '\u0033\ufe0f\u20e3', '\u0034\ufe0f\u20e3', '\u0035\ufe0f\u20e3', '\u0036\ufe0f\u20e3', '\u0037\ufe0f\u20e3', '\u0038\ufe0f\u20e3', '\u0039\ufe0f\u20e3', '\ud83d\udd1f'];
                const answersStr = answers.map((ans, idx) => `${emojis[idx]} *${ans}*`).join("\n");
                const embed = new MessageEmbed()
                    .setTitle(`${emoji.BAR_CHART} ${question}`)
                    .setDescription(answersStr)
                    .setColor(0x0077ee)
                    .setAuthor(
                        message.member ? message.member.displayName : message.author.username,
                        message.author.avatarURL()
                    )
                    .setFooter(`${seconds}" left`);

                const msg = await message.channel.send(embed);
                answers.forEach((_, i) => msg.react(emojis[i]));

                let canUpdate = true;
                const filter = (reaction, user) => emojis.includes(reaction.emoji.name);
                msg.awaitReactions(filter, {time: seconds * 1000}).then(collected => {
                    canUpdate = false;
                    const total = collected.reduce((p, c) => p + c.count - 1, 0);
                    embed.setTitle(`${emoji.BAR_CHART} Encuesta finalizada`)
                        .setDescription(`**${question}**`)
                        .setFooter(`${seconds} s.`)
                        .setColor(0x0)
                        .addFields(...answers.map((ans, idx) => {
                            const v = collected.find(v => v.emoji.name === emojis[idx]);
                            if (!v) return null;
                            const perc = total > 0 ? Math.round(10000 * (v.count - 1) / total) / 100 : 0;
                            return {
                                name: `${v.emoji} *${ans}*`,
                                value: `**${v.count - 1} voto${v.count > 2 ? '' : 's'} (${perc}%)**`,
                                inline: true
                            };
                        }));
                    msg.edit(embed).then();
                });

                for (let left = seconds - 30; left > 0 && canUpdate; left -= 30) {
                    await new Promise(res => setTimeout(() => {
                        if (!canUpdate) return;
                        embed.setFooter(`${left}" left`)
                        msg.edit(embed);
                        res();
                    }, 30000));
                }
            }
        }
    }]
}
