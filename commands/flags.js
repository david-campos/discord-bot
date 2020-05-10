/**
 * @typedef Flag
 * @property {string} emoji
 * @property {string} code
 * @property {string} unicode
 * @property {string} name
 */

const {MessageEmbed} = require("discord.js");
const Sequelize = require("sequelize");
const config = require('../bot-config.json');
/** @type {{emoji: string, name: string, code: string, unicode: string}[]} */
const flags = require('../assets/flag-emojis.json');
const moment = require('moment');

const WRONG = '\u274c'
const RIGHT = '\u2705'

const MEDALS = [
    "\ud83e\udd47",
    "\ud83e\udd48",
    "\ud83e\udd49"
];

class ChannelState {
    constructor() {
        this.currentFlag = null;
        this.attempts = 0;
        this.hints = 0;
        this.known = new Set();

        this.speedRunRemainingFlags = null;
        this.lastFlagTime = null;
        this.lastHintTime = null;
        /** @type {module:"discord.js".Message|null} */
        this.hintMessage = null;
        this.hintText = null;
        /** @type {Map|null} */
        this.speedRunAnswers = null;
    }

    inSpeedRun() {
        return this.speedRunRemainingFlags !== null && this.speedRunRemainingFlags > 0;
    }

    /**
     * Replaces the current flag for a random new one
     */
    newFlag() {
        let flag;
        do {
            flag = flags[Math.floor(Math.random() * flags.length)];
        } while (!flag.emoji); // Should not happen
        this.currentFlag = flag;
        this.attempts = 0;
        this.hints = 0;
        this.lastFlagTime = moment();
        this.known.clear();
    }

    /**
     * Gets a random hint, which means it shows some new letters.
     * This function directly adds the selected new letters to the global variable "known",
     * so they never get repeated unless the variable gets cleared.
     * Only alphanumerical characters are candidates to selection,
     * the rest are shown always by default.
     * @returns {string}
     */
    getRandomHint() {
        if (!this.currentFlag) return "";
        const letters = this.currentFlag.name.split("")
            .map((l, i) => [l, i])
            .filter(pair => pair[0].match(/[A-Za-z]/) && !this.known.has(pair[1]))
            .map(pair => pair[1]);
        let howMany = Math.round(letters.length / (5 + Math.random() * 5));
        if (howMany === 0) howMany = 1;
        howMany = Math.min(howMany, letters.length);
        let count = 0;
        while (count < howMany) {
            const next = Math.floor(Math.random() * letters.length);
            this.known.add(letters.splice(next, 1)[0]);
            count++;
        }
        this.lastHintTime = moment();
        return this.currentFlag.name.split("").map(
            (v, i) => this.known.has(i) || v.match(/[^A-Za-z]/) ? v + " " : "\\_ ").join("");
    }

    /**
     * Scores a given guess at the current flag based on the number of wrong characters per word,
     * giving an idea of how mistaken the guess is.
     * @param {string} guess the string we want to score as a guess for the current flag
     * @returns {number}
     */
    mistakesInGuess(guess) {
        if (!this.currentFlag) return 0;
        guess = normalize(guess);
        const right = normalize(this.currentFlag.name);
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
     * @param {module:"discord.js".TextChannel} channel
     * @param {string} [description]
     */
    async sendCurrentFlag(channel, description) {
        const embed = new MessageEmbed()
            .setTitle(`${this.currentFlag.emoji} What does this flag represent?`)
            .setColor(0xffffff)
            .setDescription(description || `Use \`${config.prefix}flag country\` to guess.`);
        await channel.send(embed);
        await channel.send(this.currentFlag.emoji);
    }

    /**
     * @param {Message} message
     * @param {Bot} context
     */
    async speedRunMessageReception(message, context) {
        if (message.author.bot) return;
        if (message.content === "??" || message.content === "?") {
            if (this.lastHintTime === null || moment().diff(this.lastHintTime, 's') >= 3) {
                setTimeout(() => {
                    if (this.hintMessage) {
                        this.hintMessage.edit(this.hintText);
                    }
                }, 3000);
                this.hintText = `Hint: ${this.getRandomHint()}\n`;
                const content = this.hintText + `Hint cooldown! 3s remaining.`;
                if (this.hintMessage) {
                    this.hintMessage.edit(content).then();
                } else {
                    this.hintMessage = await message.channel.send(content);
                }
            } else {
                const milis = Math.max(3000 - moment().diff(this.lastHintTime, 'milliseconds'), 0);
                const text = `Hint cooldown! ${milis / 1000}s remaining.`;
                if (this.hintMessage) {
                    await this.hintMessage.edit(this.hintText + text);
                }
            }
        } else if (message.content === "\u274c") {
            this.speedRunRemainingFlags = null;
            this.hintMessage = null;
            this.speedRunAnswers = null;
            this.currentFlag = null;
            context.unlockMessageReception(message.channel);
            const embed = new MessageEmbed()
                .setTitle(`Speed-run cancelled!`)
                .setColor(0xff0000)
                .setDescription(`The current speed run has been cancelled`);
            await message.channel.send(embed);
        } else {
            if (this.currentFlag == null) return;
            const accepted = await this.flagGuess(message.channel, message.author, message.content, context, message, true);
            if (this.currentFlag === null && accepted) {
                this.speedRunRemainingFlags -= 1;
                const guessTime = moment().diff(this.lastFlagTime, 'milliseconds', true);
                let arr = this.speedRunAnswers.get(message.author.id);
                if (arr === undefined) {
                    arr = [guessTime];
                } else {
                    arr.push(guessTime);
                }
                this.speedRunAnswers.set(message.author.id, arr);
                if (this.inSpeedRun()) {
                    this.newFlag();
                    this.hintMessage = null;
                    await this.sendCurrentFlag(message.channel, `Remaining flags: ${this.speedRunRemainingFlags}`);
                } else {
                    this.speedRunRemainingFlags = null;
                    this.hintMessage = null;
                    /** @type {[EmbedFieldData[], number, number]}*/
                    const fields = [];
                    for (let [userId, answers] of this.speedRunAnswers.entries()) {
                        const user = await context.client.users.fetch(userId);
                        const avgTime = answers.reduce((p, c) => p + c) / answers.length;
                        fields.push([{
                            name: user.username,
                            value: `Guesses: ${answers.length}\n`
                                + `Average guess time: ${(avgTime / 1000).toFixed(2)}`,
                            inline: true
                        }, avgTime, answers.length]);
                    }
                    fields.sort((a, b) => {
                        const val = -(a[2] - b[2]);
                        if (val === 0) {
                            return a[1] - b[1];
                        } else return val;
                    });
                    for (let i = 0; i < MEDALS.length; i++) {
                        if (fields[i]) fields[i][0].name = `${MEDALS[i]} ${fields[i][0].name}`
                    }
                    const embed = new MessageEmbed()
                        .setTitle(`End of the speed-run!`)
                        .setColor(0xff00ff)
                        .setDescription(`This are the results:`)
                        .addFields(fields.map(el => el[0]));
                    await message.channel.send(embed);
                    context.unlockMessageReception(message.channel);
                }
            }
        }
    }

    /**
     * @param {module:"discord.js".TextChannel} channel
     * @param {module:"discord.js".User} user
     * @param {string} guess
     * @param {Bot} context
     * @param {Message} [reactToMessage] if present, react to the message instead of answering with a new message
     * @param {boolean} [doNotSave]
     * @returns {boolean}
     */
    async flagGuess(channel, user, guess, context, reactToMessage,
                             doNotSave) {
        const score = this.mistakesInGuess(guess)
        this.attempts += 1;
        const accepted = score === 0;
        const flagName = this.currentFlag.name;
        const flagEmoji = this.currentFlag.emoji;
        if (accepted) {
            if (!doNotSave) {
                ScoreEntry.create({
                    user_id: user.id,
                    attempts: this.attempts,
                    hints: this.hints,
                    flag: this.currentFlag.name,
                    score: score
                }).then();
            }
            this.currentFlag = null;
        }
        if (!reactToMessage) {
            const afterText = accepted ?
                `is the flag of ${flagName}.\n\nGuessed by: ${user.username}` :
                `is not the flag of ${guess}.\n`
            const color = accepted ? 0x00ff00 : 0xff0000;
            const embed = new MessageEmbed()
                .setTitle(`${accepted ? `${RIGHT} Correct` : `${WRONG} Wrong`}!`)
                .setColor(color)
                .setDescription(`${flagEmoji} ${afterText}
Mistakes: ${score}
Attempts: ${this.attempts}
Hints: ${this.hints}`
                );
            await channel.send(embed);
        } else {
            await reactToMessage.react(accepted ? RIGHT : WRONG);
        }
        return accepted;
    }
}

/**
 * @type {Map<string, ChannelState>}
 */
const channelStates = new Map();

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

/**
 * @param {module:"discord.js".Message} message
 * @return {ChannelState}
 */
function getOrGenerateState(message) {
    if (channelStates.has(message.channel.id)) {
        return channelStates.get(message.channel.id);
    } else {
        const state = new ChannelState();
        channelStates.set(message.channel.id, state);
        return state;
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
            /**
             * @param {module:"discord.js".Message} message
             * @param {string[]} args
             * @param {Bot} context
             */
            execute(message, args, context) {
                const state = getOrGenerateState(message);
                if (args.length === 0 || state.currentFlag == null) {
                    if (state.currentFlag == null) {
                        state.newFlag();
                    }
                    state.sendCurrentFlag(message.channel).then();
                } else {
                    state.flagGuess(message.channel, message.author, args.join(" "), context).then();
                }
            }
        },
        {
            name: 'flag-speed',
            description: 'Initiates a flag speedrun',
            /**
             * @param {module:"discord.js".Message} message
             * @param {string[]} args
             * @param {Bot} context
             */
            execute(message, args, context) {
                const state = getOrGenerateState(message);
                if (state.currentFlag) {
                    message.reply("you can't start a speedrun until you guess the current flag. Now go to your room.");
                    return;
                }
                if (args.length === 0 || isNaN(args[0]) || parseInt(args[0], 10) < 1) {
                    message.reply(`use \`${config.prefix}flag-speed x\`, where x is the number of flags, you tard.`);
                    return;
                }
                state.speedRunRemainingFlags = parseInt(args[0], 10);
                state.speedRunAnswers = new Map();
                const embed = new MessageEmbed()
                    .setTitle(`\u23f2\ufe0f Speed-run started!`)
                    .setColor(0x0000ff)
                    .setDescription("Use `??` for hints or \u274c to cancel the speedrun.");
                message.channel.send(embed);
                state.newFlag();
                state.sendCurrentFlag(message.channel, `Remaining flags: ${this.speedRunRemainingFlags}`).then();
                context.lockMessageReception(message.channel, state.speedRunMessageReception.bind(state));
            }
        },
        {
            name: 'flag-hint',
            description: 'Gives a hint',
            /**
             * @param {Message} message
             * @param {string[]} args
             * @param {Bot} context
             */
            execute(message, args, context) {
                const state = getOrGenerateState(message);
                if (state.currentFlag === null) {
                    message.reply(`use \`${config.prefix}flag\` to get a random flag to guess, you lil piece of shit.`);
                    return;
                }
                const hint = state.getRandomHint();
                state.hints += 1;
                message.channel.send(`The answer is  ${hint} (${state.hints} total hints)`);
            }
        },
        {
            name: 'flag-stats',
            description: "Lists flag scores",
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
