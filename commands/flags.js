const {MessageEmbed} = require("discord.js");
const Sequelize = require("sequelize");
const config = require('../bot-config.json');
const flags = require('../assets/flag-emojis.json');

const WRONG = '\u274c'
const RIGHT = '\u2705'

let currentFlag = null;
let attempts = 0;
let hints = 0;
let known = new Set();

class ScoreEntry extends Sequelize.Model {
}

function normalize(str) {
    return str.toLowerCase().trim()
        .normalize("NFD")
        .replace(/[^A-Za-z0-9\s\-]+/g, "")
        .replace(/(\s|-)+/g, " ");
}

module.exports = {
    init: function (context) {
        ScoreEntry.init({
            user_id: {type: Sequelize.STRING, allowNull: false},
            attempts: {type: Sequelize.INTEGER, allowNull: false},
            hints: {type: Sequelize.INTEGER, allowNull: false},
            flag: {type: Sequelize.STRING, allowNull: false}
        }, {sequelize: context.sequelize, modelName: 'flags_score_entry'});
    },
    commands: [
        {
            name: 'flag',
            description: 'Gives a random flag to guess',
            execute(message, args, context) {
                if (currentFlag == null) {
                    let flag;
                    do {
                        flag = flags[Math.floor(Math.random() * flags.length)];
                    } while (!flag.emoji);
                    currentFlag = flag;
                    attempts = 0;
                    hints = 0;
                    known.clear();
                }
                const embed = new MessageEmbed()
                    .setTitle(`${currentFlag.emoji} What does this flag represent?`)
                    .setColor(Math.random() * 0xffffff)
                    .setDescription(`Use \`${config.prefix}gflag country\` to guess.`);
                message.channel.send(embed);
                message.channel.send(currentFlag.emoji);
            }
        },
        {
            name: 'hflag',
            description: 'Gives a hint',
            execute(message, args, context) {
                if (currentFlag === null) {
                    message.reply(`use \`${config.prefix}flag\` to get a random flag to guess, you lil piece of shit.`);
                    return;
                }
                const letters = currentFlag.name.split("")
                    .map((l, i) => [l, i])
                    .filter(pair => pair[0].match(/[A-Za-z]/) && !known.has(pair[1]))
                    .map(pair => pair[1]);
                let howMany = Math.round(letters.length / (5 + Math.random() * 5));
                if (howMany === 0) howMany = 1;
                howMany = Math.min(howMany, letters.length);
                let count = 0;
                while (count < howMany) {
                    const next = Math.floor(Math.random() * letters.length);
                    known.add(letters.splice(next, 1)[0]);
                    count++;
                }
                const hint = currentFlag.name.split("").map(
                    (v, i) => known.has(i) || v.match(/[^A-Za-z]/) ? v + " " : "\\_ ").join("");
                hints += count;
                message.channel.send(`The answer is  ${hint} (+${count} hints)`);
            }
        },
        {
            name: 'gflag',
            description: 'Guesses a flag',
            execute(message, args, context) {
                if (currentFlag === null) {
                    message.reply(`use \`${config.prefix}flag\` to get a random flag to guess, you asshole.`);
                    return;
                }
                if (args.length === 0) {
                    message.reply("empty string? Really? You tard.");
                    return;
                }
                const guess = normalize(args.join(" "))
                const right = normalize(currentFlag.name);
                const guessWords = guess.split(" ");
                const rightWords = right.split(" ");
                let score = 0;
                for (let j = 0; j < Math.max(guessWords.length, rightWords.length); j++) {
                    if (j >= guessWords.length) {
                        score += rightWords[j].length;
                    } else if (j >= rightWords.length) {
                        score += guessWords[j].length;
                    } else {
                        const gw = guessWords[j];
                        const rw = rightWords[j];
                        for (let i = 0; i < Math.max(gw.length, rw.length); i++) {
                            if (rw.length <= i || gw.length <= i || rw[i] !== gw[i]) {
                                score += 1;
                            }
                        }
                    }
                }
                attempts += 1;
                const accepted = score === 0;
                const afterText = accepted ?
                    `is the flag of ${currentFlag.name}.\n\nGuessed by: ${message.author.username}` :
                    `is not the flag of ${args.join(" ")}.\n`
                const color = accepted ? 0x00ff00 : 0xff0000;
                const embed = new MessageEmbed()
                    .setTitle(`${accepted ? `${RIGHT} Correct` : `${WRONG} Wrong`}!`)
                    .setColor(color)
                    .setDescription(
                        `${currentFlag.emoji} ${afterText}
Mistakes: ${score}
Attempts: ${attempts}
Hints: ${hints}`);
                message.channel.send(embed);
                if (accepted) {
                    ScoreEntry.create({
                        user_id: message.author.id,
                        attempts: attempts,
                        hints: hints,
                        flag: currentFlag.name,
                        score: score
                    }).then();
                    currentFlag = null;
                }
            }
        },
        {
            name: 'lflag',
            description: "Lists flag scores",
            execute(message, args, context) {
                if (message.mentions.users.size > 0) {
                    const user = message.mentions.users.first();
                    const userId = user.id;
                    ScoreEntry.findOne({
                        attributes: [
                            [context.sequelize.fn('AVG', context.sequelize.col('attempts')), 'avg_attempts'],
                            [context.sequelize.fn('AVG', context.sequelize.col('hints')), 'avg_hints'],
                            [context.sequelize.fn('COUNT', '*'), 'guesses']
                        ],
                        group: 'user_id',
                        where: {user_id: userId}
                    }).then(stats => {
                        if (stats) {
                            const embed = new MessageEmbed()
                                .setTitle(`\ud83d\udcca Stats for ${user.username}`)
                                .setColor(Math.random() * 0xffffff)
                                .setDescription(
                                    `Average attempts: ${stats.get('avg_attempts')}\n`
                                    + `Average hints: ${stats.get('avg_hints')}\n`
                                    + `Total guesses: ${stats.get('guesses')}`
                                );
                            message.channel.send(embed);
                        }
                    });
                } else {
                    ScoreEntry.findAll({
                        attributes: [
                            'user_id',
                            [context.sequelize.fn('AVG', context.sequelize.col('attempts')), 'avg_attempts'],
                            [context.sequelize.fn('AVG', context.sequelize.col('hints')), 'avg_hints'],
                            [context.sequelize.literal('500*(AVG(`attempts`)+AVG(`hints`))'), 'ranking_score'],
                            [context.sequelize.fn('COUNT', context.sequelize.literal('*')), 'guesses']
                        ],
                        group: 'user_id',
                        order: [context.sequelize.literal('ranking_score')],
                        limit: 3
                    }).then(async stats => {
                        const users = [];
                        for (let stat of stats) {
                            const user = await context.client.users.fetch(stat.user_id);
                            users.push(user);
                        }
                        const medals = [
                            "\ud83e\udd47",
                            "\ud83e\udd48",
                            "\ud83e\udd49"
                        ];
                        const fields = stats.map((stat, idx) => ({
                            name: `${medals[idx]} ${users[idx].username}`,
                            value: `    Ranking: ${stat.get('ranking_score').toFixed(2)}\n`
                                + `    Average attempts: ${stat.get('avg_attempts').toFixed(4)}\n`
                                + `    Average hints: ${stat.get('avg_hints').toFixed(4)}\n`
                                + `    Total guesses: ${stat.get('guesses')}\n`,
                            inline: true
                        }));
                        if (stats) {
                            const embed = new MessageEmbed()
                                .setTitle(`\ud83d\udcca Top users`)
                                .setColor(Math.random() * 0xffffff)
                                .setDescription(`Lower ranking is cooler!`)
                                .addFields(fields);
                            await message.channel.send(embed);
                        }
                    });
                }
            }
        }
    ]
};
