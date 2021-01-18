const {MessageEmbed} = require('discord.js');
const emoji = require('../emojis2');
const {apelativoRandom} = require("../main/apelativos");

const SECS_TIME_UPDATE = 10;

const DEFAULT_ANSWERS = [emoji.THUMBS_UP, emoji.THUMBS_DOWN];
const NUM_EMOJIS = ['\u0031\ufe0f\u20e3', '\u0032\ufe0f\u20e3', '\u0033\ufe0f\u20e3', '\u0034\ufe0f\u20e3', '\u0035\ufe0f\u20e3', '\u0036\ufe0f\u20e3', '\u0037\ufe0f\u20e3', '\u0038\ufe0f\u20e3', '\u0039\ufe0f\u20e3', '\ud83d\udd1f'];

function isEmoji(text) {
    return /\p{Emoji}/u.test(text) && (NUM_EMOJIS.includes(text) || Object.values(emoji).includes(text));
}

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
                optional: true,
                format: '"Respuesta 1" "Respuesta 2" Respuesta3',
                defaultValue: DEFAULT_ANSWERS.join(" / ")
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
            /** @type {string[]} */
            const answers = [];
            while (obj.text) {
                const ans = getNext(obj);
                if (ans && !answers.includes(ans))
                    answers.push(ans);
                if (answers.length > 10) {
                    message.reply(`más de diez respuestas no manejo, ${apelativoRandom()}.`).then();
                    return;
                }
            }
            if (answers.length < 2) {
                answers.splice(0, answers.length, ...DEFAULT_ANSWERS);
            }
            NUM_EMOJIS.forEach((em, emIdx) => {
                const idx = answers.indexOf(em);
                if (idx === -1) return;
                const aux = answers[emIdx];
                answers[emIdx] = answers[idx];
                answers[idx] = aux;
            });
            const emojis = NUM_EMOJIS.filter(em => !answers.includes(em)); // already an emoji
            const areEmojis = answers.map(ans => isEmoji(ans));
            const answersStr = answers.map((ans, idx) =>
                areEmojis[idx] ? ans : `${emojis[idx]} *${ans}*`
            ).join("\n");
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
            let next = 0;
            const reactions = answers.map((_, i) =>
                areEmojis[i] ? answers[i] : emojis[next++]
            );
            reactions.forEach(r => msg.react(r));

            let canUpdate = true;
            const filter = (reaction, user) => reactions.includes(reaction.emoji.name);
            msg.awaitReactions(filter, {time: seconds * 1000}).then(collected => {
                canUpdate = false;
                const total = collected.reduce((p, c) => p + c.count - 1, 0);
                embed.setTitle(`${emoji.BAR_CHART} Encuesta finalizada`)
                    .setDescription(`**${question}**`)
                    .setFooter(`${seconds} s.`)
                    .setColor(0x0)
                    .addFields(...answers.map((ans, idx) => {
                        const v = collected.find(v => v.emoji.name === reactions[idx]);
                        if (!v) return null;
                        const perc = total > 0 ? Math.round(10000 * (v.count - 1) / total) / 100 : 0;
                        return {
                            name: areEmojis[idx] ? ans : `${v.emoji} *${ans}*`,
                            value: `**${v.count - 1} voto${v.count > 2 ? '' : 's'} (${perc}%)**`,
                            inline: true
                        };
                    }));
                msg.edit(embed).then();
            });

            for (let left = seconds - SECS_TIME_UPDATE; left > 0 && canUpdate; left -= SECS_TIME_UPDATE) {
                await new Promise(res => setTimeout(() => {
                    if (!canUpdate) return;
                    embed.setFooter(`${left}" left`)
                    msg.edit(embed);
                    res();
                }, SECS_TIME_UPDATE * 1000));
            }
        }
    }]
}
