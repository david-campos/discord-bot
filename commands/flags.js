/**
 * @typedef Flag
 * @property {string} emoji
 * @property {string} code
 * @property {string} unicode
 * @property {string} name
 */

const {MessageEmbed} = require("discord.js");
const Sequelize = require("sequelize");
const {GuessingController, DEFAULT_SPEEDRUN_LENGTH} = require('../guess_quizz/guess_quizz');
const config = require('../bot-config.json');
const flags = require('country-flag-emoji');
const {MEDALS, WRONG, RIGHT} = require("../guess_quizz/emojis");

/**
 * @extends GuessingController<Flag>
 */
class FlagController extends GuessingController {
    constructor() {
        super(flags.list, 3000,
            10, 300, 500);
    }

    async sendCase(channel, guessCase, description) {
        await super.sendCase(channel, guessCase, description);
        channel.send(guessCase.item.emoji);
    }

    caseToEmbed(guessCase, description) {
        return new MessageEmbed()
            .setTitle(`${guessCase.item.emoji} What does this flag represent?`)
            .setColor(0xffffff)
            .setDescription(description || `Use \`${config.prefix}flag country\` to guess.`);
    }

    /**
     * @param message
     * @param {GuessCase<Flag>} guessingCase
     * @param {string} guess
     * @return {module:"discord.js".MessageEmbed}
     */
    embedForRightGuess(message, guessingCase, guess) {
        /** @type {Flag} */
        const flag = guessingCase.item;
        return new MessageEmbed()
            .setTitle(`${RIGHT} Correct`)
            .setColor(0x00ff00)
            .setDescription(`${flag.emoji} is the flag of ${flag.name}
Attempts: ${guessingCase.attempts}
Hints: ${guessingCase.hints}`
            );
    }

    embedForWrongGuess(message, guessingCase, guess, mistakes) {
        return new MessageEmbed()
            .setTitle(`${WRONG} Incorrect!`)
            .setColor(0xff0000)
            .setDescription(`${guessingCase.item.emoji} is not the flag ${guess}\n`
                + `Attempts: ${guessingCase.attempts}\nHints: ${guessingCase.hints}`);
    }

    expertKey(guessCase) {
        return guessCase.item.emoji;
    }

    itemSolution(item) {
        return item.name;
    }

    async saveScore(user, guessCase) {
        await ScoreEntry.create({
            user_id: user.id,
            attempts: guessCase.attempts,
            hints: guessCase.hints,
            flag: guessCase.item.name
        });
    }
}

/**
 * To save the score entries into the database
 */
class ScoreEntry extends Sequelize.Model {
}

/**
 * Answers to the message with the stats for the mentioned users
 * @param {Message} message
 * @param {Bot} context
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
 * @param {Bot} context
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
 * @param {Bot} context
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

const controller = new FlagController();

const SUBCOMMANDS = {
    speed: controller.cmdSpeedRunStart.bind(controller),
    hint: controller.cmdHint.bind(controller),
    expert: controller.cmdExpertRunStart.bind(controller),
    stats: async (message, args, context) => {
        if (message.mentions.users.size > 0) {
            await answerMentionedUserStats(message, context);
        } else {
            await answerTopUserStats(message, context);
        }
    }
};

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
            shortDescription: 'Acierta la bandera (en inglés)',
            description: 'Guess the corresponding countries to given flags.',
            usage: [
                {
                    subcommand: 'Basic',
                    description: 'Gives a random flag to guess or guesses the current flag obtained this way',
                    args: [{name: 'guess', description: 'country you guess the flag belongs to', optional: true}]
                },
                {
                    subcommand: 'Speed',
                    description: 'Initiates a flag speedrun. During the speedrun anyone can answer, flags will come one after the other, the first person to answer the correct country for the flag will get the point.',
                    args: [
                        {name: 'speed', isLiteral: true},
                        {
                            name: 'N',
                            description: 'number of flags in the speedrun',
                            optional: true,
                            format: 'positive integer',
                            defaultValue: DEFAULT_SPEEDRUN_LENGTH
                        }
                    ],
                },
                {
                    subcommand: 'Hint',
                    description: 'Gives a hint for the current flag guess',
                    args: [{name: 'hint', isLiteral: true}],
                },
                {
                    subcommand: 'Expert',
                    description: 'Start an expert run, a challenge not made for the faint of heart!',
                    args: [{name: 'expert', isLiteral: true}]
                },
                {
                    subcommand: 'Stats',
                    description: "Lists flag scores. By default it lists the top user stats, unless other users are mentioned in the message.",
                    args: [
                        {name: 'stats', isLiteral: true},
                        {
                            name: '...@someone', description: 'mention users to see only the specified users stats',
                            optional: true, format: 'discord mention'
                        }
                    ]
                }
            ],
            execute: (msg, args, bot) => {
                if (args.length > 0 && (args[0] in SUBCOMMANDS)) {
                    SUBCOMMANDS[args[0]](msg, args.slice(1), bot);
                } else {
                    controller.cmdBasic(msg, args, bot);
                }
            }
        }
    ]
};
