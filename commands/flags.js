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
            description: 'Gives a random flag to guess or guesses the current flag obtained this way',
            usage: [
                {name: 'guess', description: 'country you guess the flag belongs to', optional: true}
            ],
            execute: controller.cmdBasic.bind(controller)
        },
        {
            name: 'flag-speed',
            description: 'Initiates a flag speedrun',
            usage: [
                {name: 'N', description: 'number of flags in the speedrun', optional: true, format: 'positive integer',
                    defaultValue: DEFAULT_SPEEDRUN_LENGTH}
            ],
            execute: controller.cmdSpeedRunStart.bind(controller)
        },
        {
            name: 'flag-hint',
            description: 'Gives a hint for the current flag guess',
            usage: [],
            execute: controller.cmdHint.bind(controller)
        },
        {
            name: 'flag-expert',
            description: 'Start an expert run, a challenge not made for the faint of heart!',
            usage: [],
            execute: controller.cmdExpertRunStart.bind(controller)
        },
        {
            name: 'flag-stats',
            usage: [{
                name: '...@someone', description: 'mention users to see only the specified users stats',
                optional: true, format: 'discord mention'
            }],
            description: "Lists flag scores. By default it lists the top user stats, unless other users are mentioned in the message.",
            /**
             * @param {Message} message
             * @param {string[]} args
             * @param {Bot} context
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
