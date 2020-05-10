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
const flags = require('emoji-flags');
const moment = require('moment');

const WRONG = '\u274c'
const RIGHT = '\u2705'

const EXPERT_RUN_SECS = 5;
const EXPERT_MAX_FAILURES = 10;

const MEDALS = [
    "\ud83e\udd47",
    "\ud83e\udd48",
    "\ud83e\udd49"
];

class ChannelState {
    /**
     * @param {Bot} bot
     * @param {string} channelId
     */
    constructor(bot, channelId) {
        this.bot = bot;
        this.channelId = channelId;

        /** @type {Flag|null} */
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

        /** @type {string|null} */
        this.expertRunUserId = null;
        /** @type {Flag[]|null} */
        this.expertRunPool = null;
        /** @type {number} */
        this.expertRunFailures = 0;
        /** @type {number|null} */
        this.expertRunTimeout = null;
    }

    inSpeedRun() {
        return this.speedRunRemainingFlags !== null && this.speedRunRemainingFlags > 0;
    }

    /**
     * Replaces the current flag for a random new one
     * @param {Flag[]} [pool] - flag of pools to take one from, if undefined it will pick one
     * at random from flags.data. Notice if you pass a pool in, the selected flag will be popped
     * from the pool.
     */
    newFlag(pool) {
        const flagArray = pool ? pool : flags.data;
        let flag;
        let index = Math.floor(Math.random() * flagArray.length) - 1; //  we will add one at the start of the loop
        do {
            index = (index + 1) % flagArray.length;
            flag = flagArray[index];
        } while (!flag.emoji); // Should not happen
        // If we received a pull, pop from the pull
        if (pool) {
            pool.splice(index, 1);
        }
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

    /**
     * @param {module:"discord.js".Message} message
     * @param {Bot} context
     */
    async startExpertRun(message, context) {
        if (this.expertRunUserId !== null) {
            throw new Error('there is already an expert run going on!');
        }
        if (this.currentFlag != null) {
            throw new Error('you must guess the current flag before starting an expert run.');
        }
        this.expertRunUserId = message.author.id;
        this.expertRunPool = flags.data.slice(0); // clone of all the flags
        this.expertRunFailures = 0;
        this.newFlag(this.expertRunPool);
        context.lockMessageReception(message.channel, this._expertRunMessageReception.bind(this));

        const displayName = message.member ? message.member.displayName : message.author.username;

        const embed = new MessageEmbed()
            .setTitle(`\ud83d\udc53 ${displayName} has started an **expert run**!`)
            .setColor(0xf040c0)
            .setDescription(
                `\u26a0 During the run, I will only be listening to **${message.author.username}**.\n\n` +
                `\u23f2 You have ${EXPERT_RUN_SECS} to answer each flag (it resets on mistakes).\n` +
                `\u2753 There is no option for hints.\n` +
                `\ud83d\udea7 You can only make ${EXPERT_MAX_FAILURES} mistakes in total.\n`
            );
        await message.channel.send(embed);
        await message.channel.send(this.currentFlag.emoji);
        await message.channel.send(
            `*Remaining flags: ${this.expertRunPool.length + 1}*\n*Failures: **${this.expertRunFailures}***`);
        this._expertResetTimeout();
    }

    _expertResetTimeout() {
        clearTimeout(this.expertRunTimeout);
        this.expertRunTimeout = setTimeout(
            this._expertRunOnTimedOut.bind(this),
            EXPERT_RUN_SECS * 1000);
    }

    _expertRunOnTimedOut() {
        const channel = this.bot.client.channels.cache.get(this.channelId);
        if (!channel)
            throw new Error('Expert run timeout but channel not in cache!');
        this.expertRunUserId = null;
        this.currentFlag = null;
        this.bot.unlockMessageReception(channel);

        const embed = new MessageEmbed()
            .setTitle(`${WRONG} Expert run failed!`)
            .setColor(0xff0000)
            .setDescription(
                `\u23f2 You ran out of time to answer the flag, next time remember you only have ${EXPERT_RUN_SECS} seconds!\n` +
                this._expertAnsweredFlagsText()
            );
        channel.send(embed);
    }

    _expertAnsweredFlagsText() {
        const answered = flags.data.length - this.expertRunPool.length - 1; // last one not answered, so -1
        const percentage = Math.round(answered / flags.data.length * 100);
        return `Total answered flags: ${answered} (${percentage}%)`;
    }

    /**
     * @param {module:"discord.js".Message} message
     * @param {Bot} context
     * @private
     */
    async _expertRunMessageReception(message, context) {
        if (!message.author || message.author.id !== this.expertRunUserId)
            return; // Ignore everyone else

        if (this.currentFlag == null) return;
        clearTimeout(this.expertRunTimeout);
        this.expertRunTimeout = null;
        const accepted = await this.flagGuess(message.channel, message.author,
            message.content, context, message, true);
        if (accepted) {
            if (this.expertRunPool.length > 0) {
                this.newFlag(this.expertRunPool);
                await message.channel.send(this.currentFlag.emoji);
                await message.channel.send(
                    `*Remaining flags: ${this.expertRunPool.length + 1}*\n*Failures: **${this.expertRunFailures}***`);
                this._expertResetTimeout();
            } else {
                this.expertRunUserId = null;
                this.bot.unlockMessageReception(message.channel);

                const displayName = message.member ? message.member.displayName : message.author.username;

                const embed = new MessageEmbed()
                    .setTitle(`\ud83c\udf89 Expert run completed!`)
                    .setColor(0x00ff00)
                    .setDescription(
                        `Congratulations ${displayName}! You've completed all the flags and you are now an **EXPERT**!\n` +
                        `\ud83d\ude2e You made only ${this.expertRunFailures} mistakes!\n`
                    );
                message.channel.send(embed).then();
            }
        } else {
            this.expertRunFailures += 1;
            if (this.expertRunFailures >= EXPERT_MAX_FAILURES) {
                this.expertRunUserId = null;
                this.currentFlag = null;
                this.bot.unlockMessageReception(message.channel);

                const embed = new MessageEmbed()
                    .setTitle(`${WRONG} Expert run failed!`)
                    .setColor(0xff0000)
                    .setDescription(
                        `You made ${this.expertRunFailures} mistakes!\n` +
                        this._expertAnsweredFlagsText()
                    );
                message.channel.send(embed).then();
            } else {
                message.channel.send(`*Failures: **${this.expertRunFailures}***`).then();
                this._expertResetTimeout();
            }
        }
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
 * @param {Bot} context
 * @return {ChannelState}
 */
function getOrGenerateState(message, context) {
    if (channelStates.has(message.channel.id)) {
        return channelStates.get(message.channel.id);
    } else {
        const state = new ChannelState(context, message.channel.id);
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
                const state = getOrGenerateState(message, context);
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
                const state = getOrGenerateState(message, context);
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
                const state = getOrGenerateState(message, context);
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
            name: 'flag-expert',
            description: 'Start an expert run',
            async execute(message, args, context) {
                const state = getOrGenerateState(message, context);
                try {
                    await state.startExpertRun(message, context);
                } catch (err) {
                    message.reply(err.message);
                }
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
