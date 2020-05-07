const {MessageEmbed} = require("discord.js");
const Sequelize = require("sequelize");
const config = require('../bot-config.json');
const flags = require('../assets/flag-emojis.json');

const WRONG = '\u274c'
const RIGHT = '\u2705'

const MEDALS = [
    "\ud83e\udd47",
    "\ud83e\udd48",
    "\ud83e\udd49"
];

let currentFlag = null;
let attempts = 0;
let hints = 0;
let known = new Set();

/**
 * To save the score entries into the database
 */
class ScoreEntry extends Sequelize.Model {
}

/**
 * Normalizes the string so it can be compared
 * @param str
 * @returns {string}
 */
function normalize(str) {
    return str.toLowerCase().trim()
        .normalize("NFD")
        .replace(/[^A-Za-z0-9\s\-]+/g, "")
        .replace(/(\s|-)+/g, " ");
}

/**
 * Replaces the current flag for a random new one
 */
function newFlag() {
    let flag;
    do {
        flag = flags[Math.floor(Math.random() * flags.length)];
    } while (!flag.emoji); // Should not happen
    currentFlag = flag;
    attempts = 0;
    hints = 0;
    known.clear();
}

/**
 * Gets a random hint, which means it shows some new letters.
 * This function directly adds the selected new letters to the global variable "known",
 * so they never get repeated unless the variable gets cleared.
 * Only alphanumerical characters are candidates to selection,
 * the rest are shown always by default.
 * @returns {string}
 */
function getRandomHint() {
    if (!currentFlag) return "";
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
    hints += count;
    return currentFlag.name.split("").map(
        (v, i) => known.has(i) || v.match(/[^A-Za-z]/) ? v + " " : "\\_ ").join("");
}

/**
 * Scores a given guess at the current flag based on the number of wrong characters per word,
 * giving an idea of how mistaken the guess is.
 * @param {string} guess the string we want to score as a guess for the current flag
 * @returns {number}
 */
function mistakesInGuess(guess) {
    if (!currentFlag) return 0;
    guess = normalize(guess);
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
    return score;
}

/**
 * Answers to the message with the stats for the mentioned users
 * @param {Message} message
 * @param {Context} context
 */
async function answerMentionedUserStats(message, context) {
    for (let user of message.mentions.users.filter(u => !u.bot).array()) {
        const stats = await getUserStats(user, context);
        if (stats) {
            const embed = new MessageEmbed()
                .setTitle(`\ud83d\udcca Stats for ${user.username}`)
                .setColor(Math.random() * 0xffffff)
                .setDescription(
                    `Average attempts: ${stats.get('avg_attempts')}\n`
                    + `Average hints: ${stats.get('avg_hints')}\n`
                    + `Total guesses: ${stats.get('guesses')}`
                );
            await message.channel.send(embed);
        }
    }
}

/**
 * @param {module:"discord.js".User} user
 * @param {Context} context
 * @returns {ScoreEntry | null}
 */
async function getUserStats(user, context) {
    const userId = user.id;
    return ScoreEntry.findOne({
        attributes: [
            [context.sequelize.fn('AVG', context.sequelize.col('attempts')), 'avg_attempts'],
            [context.sequelize.fn('AVG', context.sequelize.col('hints')), 'avg_hints'],
            [context.sequelize.fn('COUNT', '*'), 'guesses']
        ],
        group: 'user_id',
        where: {user_id: userId}
    });
}

/**
 * @param {Message} message
 * @param {Context} context
 * @returns {Promise<void>}
 */
async function answerTopUserStats(message, context) {
    const stats = await ScoreEntry.findAll({
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
    });
    const users = [];
    for (let stat of stats) {
        const user = await context.client.users.fetch(stat.user_id);
        users.push(user);
    }
    const fields = stats.map((stat, idx) => ({
        name: `${MEDALS[idx]} ${users[idx].username}`,
        value: `    Ranking: ${stat.get('ranking_score').toFixed(2)}\n`
            + `    Average attempts: ${stat.get('avg_attempts').toFixed(4)}\n`
            + `    Average hints: ${stat.get('avg_hints').toFixed(4)}\n`
            + `    Total guesses: ${stat.get('guesses')}\n`,
        inline: true
    }));
    const embed = new MessageEmbed()
        .setTitle(`\ud83d\udcca Top users`)
        .setColor(Math.random() * 0xffffff)
        .setDescription(`Lower ranking is cooler, as ranking depends on average attempts and average hints!`)
        .addFields(fields);
    await message.channel.send(embed);
}

/**
 * @param {Message} message
 * @param {string[]} args
 * @param {Context} context
 * @returns {Promise<void>}
 */
async function flagGuess(message, args, context) {
    const score = mistakesInGuess(args.join(" "))
    attempts += 1;
    const accepted = score === 0;
    const afterText = accepted ?
        `is the flag of ${currentFlag.name}.\n\nGuessed by: ${message.author.username}` :
        `is not the flag of ${args.join(" ")}.\n`
    const color = accepted ? 0x00ff00 : 0xff0000;
    const embed = new MessageEmbed()
        .setTitle(`${accepted ? `${RIGHT} Correct` : `${WRONG} Wrong`}!`)
        .setColor(color)
        .setDescription(`${currentFlag.emoji} ${afterText}
Mistakes: ${score}
Attempts: ${attempts}
Hints: ${hints}`
        );
    await message.channel.send(embed);
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
                if (args.length === 0 || currentFlag == null) {
                    if (currentFlag == null) {
                        newFlag();
                    }
                    const embed = new MessageEmbed()
                        .setTitle(`${currentFlag.emoji} What does this flag represent?`)
                        .setColor(0xffffff)
                        .setDescription(`Use \`${config.prefix}flag country\` to guess.`);
                    message.channel.send(embed).then();
                    message.channel.send(currentFlag.emoji).then();
                } else {
                    flagGuess(message, args, context).then();
                }
            }
        },
        {
            name: 'flag-hint',
            description: 'Gives a hint',
            execute(message, args, context) {
                if (currentFlag === null) {
                    message.reply(`use \`${config.prefix}flag\` to get a random flag to guess, you lil piece of shit.`);
                    return;
                }
                const hint = getRandomHint();
                hints += 1;
                message.channel.send(`The answer is  ${hint} (${hints} total hints)`);
            }
        },
        {
            name: 'flag-stats',
            description: "Lists flag scores",
            /**
             * @param {Message} message
             * @param {string[]} args
             * @param {Context} context
             */
            async execute(message, args, context) {
                if (message.mentions.users.size > 0) {
                    await answerMentionedUserStats(message, context);
                } else {
                    await answerTopUserStats(message, context);
                }
            }
        }
    ]
};
