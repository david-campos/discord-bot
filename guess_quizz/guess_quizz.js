const moment = require('moment')
const {MEDALS} = require("./emojis");
const {WRONG, RIGHT} = require("./emojis");
const {MessageEmbed} = require('discord.js');
const {BaseChannelState, ChannelStateManager} = require('../main/channel_state');

const DEFAULT_SPEEDRUN_LENGTH = 17;

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
 * Base class that controls the set of commands about guessing things from a list
 * @template Item
 */
class GuessingController {
    constructor(possibilities, speedRunHintCooldown, expertMaxFailures,
                expertRunBaseTime, expertRunTimePerChar) {
        /**
         * @type {ChannelStateManager<GuessingChannel<Item>>}
         */
        this.stateManager = new ChannelStateManager(
            /**
             * @param {DiscordChannel} channel
             * @param {Bot} bot
             * @return {GuessingChannel<Item>}
             */
            (channel, bot) => new GuessingChannel(channel, bot, this)
        );
        /**
         * @type {Item[]}
         */
        this.possibilities = possibilities;
        this.speedRunHintCooldown = speedRunHintCooldown;
        this.expertMaxFailures = expertMaxFailures;
        this.expertRunBaseTime = expertRunBaseTime;
        this.expertRunTimePerChar = expertRunTimePerChar;
    }

    /**
     * Can be overwritten by children to modify the default behaviour when sending a case
     * @param {DiscordChannel} channel
     * @param {GuessCase} guessCase
     * @param {string} [description] optional description for the embed to include
     */
    async sendCase(channel, guessCase, description) {
        channel.send(this.caseToEmbed(guessCase, description));
    }

    /**
     * @abstract Implement to give the solution for a given item
     * @param {Item} item
     * @return {string}
     */
    itemSolution(item) {
        throw new Error('GuessingController::itemSolution: method must be overrided!');
    }

    /**
     * @abstract Implement to give an embed for a given guess case
     * @param {GuessCase} guessCase
     * @param {string} [description] optional description for the embed to include
     * @return {module:"discord.js".MessageEmbed}
     */
    caseToEmbed(guessCase, description) {
        throw new Error('GuessingController::caseToEmbed: method must be overrided!');
    }

    /**
     * @abstract Implement to give an embed for a given guess case
     * @param {GuessCase} guessCase
     * @return {string}
     */
    expertKey(guessCase) {
        throw new Error('GuessingController::expertKey: method must be overrided!');
    }

    /**
     * @abstract Implement to give an embed for when someone guesses an item
     * @param {DiscordMessage} message
     * @param {GuessCase<Item>} guessingCase
     * @param {string} guess
     * @return {module:"discord.js".MessageEmbed}
     */
    embedForRightGuess(message, guessingCase, guess) {
        throw new Error('GuessingController::embedForRightGuess: method must be overrided!');
    }

    /**
     * @abstract Implement to give an embed for when someone does not guess an item
     * @param {DiscordMessage} message
     * @param {GuessCase<Item>} guessingCase
     * @param {string} guess
     * @param {number|null} mistakes the number of mistakes in the guess (or null if discarded
     * because it was already guessed)
     * @return {module:"discord.js".MessageEmbed}
     */
    embedForWrongGuess(message, guessingCase, guess, mistakes) {
        throw new Error('GuessingController::embedForWrongGuess: method must be overrided!');
    }

    /**
     * @abstract Implement to save the score for a guessed item
     * @param {module:"discord.js".User} user
     * @param {GuessCase} item
     */
    async saveScore(user, item) {
        throw new Error('GuessingController::saveScore: method must be overrided!');
    }

    /**
     * @param {module:"discord.js".Message} message
     * @param {string[]} args
     * @param {Bot} context
     */
    cmdBasic(message, args, context) {
        const state = this.stateManager.getOrGenerateState(message, context);
        const currentCase = state.currentCase;
        if (args.length === 0) {
            if (currentCase === null) state.newCase();
            this.sendCase(message.channel, state.currentCase).then();
        } else if(state.currentCase) {
            const guess = args.join(" ");
            const [valid, mistakes] = state.tryGuess(guess);
            if (valid) {
                this.saveScore(message.author, currentCase).then();
                message.channel.send(this.embedForRightGuess(message, currentCase, guess)).then();
            } else {
                message.channel.send(this.embedForWrongGuess(message, currentCase, guess, mistakes)).then();
            }
        } else {
            message.reply(`no current case to guess`).then();
        }
    }

    /**
     * @param {module:"discord.js".Message} message
     * @param {string[]} args
     * @param {Bot} context
     */
    cmdHint(message, args, context) {
        /** @type {GuessingChannel<Item>} */
        const state = this.stateManager.getOrGenerateState(message, context);
        if (state.currentCase === null || state.currentCase.guessed) {
            message.reply(`nothing to guess, you lil piece of shit.`).then();
        } else {
            const hint = state.currentCase.getRandomHint();
            message.channel.send(`Hint:\n**${hint}** *(${state.currentCase.hints} total hints)*`).then();
        }
    }

    /**
     * @param {module:"discord.js".Message} message
     * @param {string[]} args
     * @param {Bot} context
     */
    async cmdSpeedRunStart(message, args, context) {
        /** @type {GuessingChannel<Item>} */
        const state = this.stateManager.getOrGenerateState(message, context);
        if (args.length > 0 && parseInt(args[0], 10) < 1) {
            message
                .reply(`the number of elements has to be a positive integer`)
                .then();
            return;
        }
        const items = args.length > 0 ? parseInt(args[0], 10) : DEFAULT_SPEEDRUN_LENGTH;
        const speedRun = new GuessSpeedRun(state, items, this.speedRunHintCooldown);
        const embed = new MessageEmbed()
            .setTitle(`\u23f2\ufe0f Speed-run started!`)
            .setColor(0x0000ff)
            .setDescription("Use `??` for hints or \u274c to cancel the speedrun.");
        await state.channel.send(embed);
        speedRun.start();
        await state.sendCurrentCase(`Remaining flags: ${speedRun.remainingCases}`);
    }

    /**
     * @param {module:"discord.js".Message} message
     * @param {string[]} args
     * @param {Bot} context
     */
    async cmdExpertRunStart(message, args, context) {
        /** @type {GuessingChannel<Item>} */
        const state = this.stateManager.getOrGenerateState(message, context);
        const expertRun = new GuessExpertRun(
            state,
            message.author.id,
            this.possibilities.slice(0),
            this.expertMaxFailures,
            this.expertRunBaseTime,
            this.expertRunTimePerChar
        );
        const displayName = message.member ? message.member.displayName : message.author.username;
        const embed = new MessageEmbed()
            .setTitle(`\ud83d\udc53 ${displayName} has started an **expert run**!`)
            .setColor(0xf040c0)
            .setDescription(
                `\u26a0 During the run, I will only be listening to **${message.author.username}**.\n\n` +
                `\u23f2 You have a limited time to answer (it resets on mistakes).\n` +
                `\u2753 There is no option for hints.\n` +
                `\ud83d\udea7 You can only make ${expertRun.maxFailures} mistakes in total.\n`
            );
        await message.channel.send(embed);
        expertRun.start();
    }
}

/**
 * @template Item
 */
class GuessingChannel extends BaseChannelState {
    /**
     * @param {DiscordChannel} channel
     * @param {Bot} bot
     * @param {GuessingController<Item>} guessingController
     */
    constructor(channel, bot, guessingController) {
        super(channel, bot);
        this.guessingController = guessingController;
        /**
         * @type {GuessCase<Item>|null}
         */
        this.currentCase = null;
    }

    /**
     * Replaces the current case for a random new one
     * @param {Item[]} [pool] - flag of pools to take one from, if undefined it will pick one
     * at random from flags.list. Notice if you pass a pool in, the selected flag will be popped
     * from the pool.
     * @return {GuessCase<Item>} the new current case
     */
    newCase(pool) {
        const itemArray = pool ? pool : this.guessingController.possibilities;
        const index = Math.floor(Math.random() * itemArray.length);
        const next = itemArray[index];

        // If we received a pull, pop from the pull
        if (pool) {
            pool.splice(index, 1);
        }

        this.currentCase = new GuessCase(next, this.guessingController.itemSolution(next));
        return this.currentCase;
    }

    /**
     * Tries to guess the current case
     * @param {string} guess
     * @return {[boolean, number]} whether it was accepted or not and the number of mistakes
     */
    tryGuess(guess) {
        const [valid, mistakes] = this.currentCase.tryGuess(guess);
        if (valid) this.currentCase = null;
        return [valid, mistakes];
    }

    /**
     * @param {string} [description] optional description for the embed to include
     */
    async sendCurrentCase(description) {
        await this.guessingController.sendCase(this.channel, this.currentCase, description);
    }

    /**
     * @return {string}
     */
    currentExpertKey() {
        return this.guessingController.expertKey(this.currentCase);
    }
}

class GuessSpeedRun {
    /**
     * @param {number} numberOfCases number of cases in the speed run
     * @param {GuessingChannel} guessingChannel
     * @param {number} hintCooldown in milliseconds
     */
    constructor(guessingChannel, numberOfCases, hintCooldown) {
        /** @type {number} */
        this.remainingCases = numberOfCases;
        /** @type {module:"discord.js".Message|null} */
        this.hintMessage = null;
        /** @type {string|null} */
        this.hintText = null;
        /** @type {number|null} */
        this.hintEditionTimeout = null;
        /** @type {number} milliseconds */
        this.hintCooldown = hintCooldown;
        /** @type {Map<string,number[]>} */
        this.answers = new Map();
        /** @type {GuessingChannel} */
        this.guessingChannel = guessingChannel;
        /** @type {number} */
        this.messagesSinceHint = 0;
    }

    start() {
        this.guessingChannel.newCase();
        this.guessingChannel.lockChannel(this._messageReception.bind(this));
    }

    shutdown() {
        if (this.hintEditionTimeout) {
            clearTimeout(this.hintEditionTimeout);
            if (this.hintMessage) this.hintMessage.edit(this.hintText).then();
        }
        if (this.guessingChannel.currentCase) this.guessingChannel.currentCase = null;
        this.guessingChannel.unlockChannel();
    }

    /**
     * @param {DiscordMessage} message
     * @param {Bot} context
     * @private
     */
    async _messageReception(message, context) {
        this.messagesSinceHint++;
        if (message.author.bot) return;
        if (message.content === "??" || message.content === "?") {
            await this._giveHint();
        } else if (message.content === "\u274c") {
            this.shutdown();
            const embed = new MessageEmbed()
                .setTitle(`Speed-run cancelled!`)
                .setColor(0xff9900)
                .setDescription(`The current speed run has been cancelled`);
            await message.channel.send(embed);
        } else {
            const accepted = this._tryGuess(message);
            if (accepted) {
                if (this.remainingCases > 0) {
                    this.guessingChannel.newCase();
                    this.hintMessage = this.hintText = null;
                    this.guessingChannel
                        .sendCurrentCase(`Remaining flags: ${this.remainingCases}`)
                        .then();
                } else {
                    this.shutdown();
                    this._sendResults().then();
                }
            }
            message.react(accepted ? RIGHT : WRONG).then();
        }
    }

    /**
     * @param {DiscordMessage} message
     * @private
     */
    _tryGuess(message) {
        const current = this.guessingChannel.currentCase;
        const [accepted, mistakes] = this.guessingChannel.tryGuess(message.content);

        if (accepted) {
            this.remainingCases -= 1;
            const guessTime = moment().diff(current.creationTime, 'milliseconds', true);

            // Add guess time to array
            let arr = this.answers.get(message.author.id);
            if (arr === undefined) arr = [guessTime];
            else arr.push(guessTime);
            this.answers.set(message.author.id, arr);
        }

        return accepted;
    }

    async _sendResults() {
        const fields = [];
        for (let [userId, answers] of this.answers.entries()) {
            const user = await this.guessingChannel.context.client.users.fetch(userId);
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
            .setDescription(`These are the results:`)
            .addFields(fields.map(el => el[0]));
        await this.guessingChannel.channel.send(embed);
    }

    async _giveHint() {
        const currentCase = this.guessingChannel.currentCase;
        if (!currentCase) return;
        if (currentCase.lastHintTime === null
            || moment().diff(currentCase.lastHintTime, 'milliseconds') >= this.hintCooldown) {
            // Not in hint cooldown
            this.hintEditionTimeout = setTimeout(() => {
                if (this.hintMessage) {
                    this.hintMessage.edit(this.hintText).then();
                }
            }, this.hintCooldown);
            this.hintText = `Hint: ${currentCase.getRandomHint()}\n`;
            const content = this.hintText + `Hint cooldown! 3s remaining.`;
            if (this.hintMessage && this.messagesSinceHint < 10) {
                this.hintMessage.edit(content).then();
            } else {
                this.hintMessage = await this.guessingChannel.channel.send(content);
            }
            this.messagesSinceHint = 0;
        } else if (this.hintMessage) {
            // In cooldown
            const milis = Math.max(3000 - moment().diff(currentCase.lastHintTime, 'milliseconds'), 0);
            const text = `Hint cooldown! ${milis / 1000}s remaining.`;
            await this.hintMessage.edit(this.hintText + text);
        }
    }
}

class GuessExpertRun {
    /**
     * @param {GuessingChannel} guessingChannel
     * @param {string} userId
     * @param {array} pool
     * @param {number} maxFailures
     * @param {number} baseTime in millis
     * @param {number} timePerChar in millis
     */
    constructor(guessingChannel, userId, pool,
                maxFailures, baseTime, timePerChar) {
        this.guessingChannel = guessingChannel;
        this.userId = userId;
        this.pool = pool;
        /** @type {number} */
        this.failures = 0;
        /** @type {number|null} */
        this.timeout = null;
        this.maxFailures = maxFailures;
        /**
         * Minimum milliseconds to think
         * @type {number}
         */
        this.baseTime = baseTime;
        /**
         * Milliseconds extra per character of the solution
         * @type {number}
         */
        this.timePerChar = timePerChar;
    }

    start() {
        this.guessingChannel.newCase(this.pool);
        this.guessingChannel.lockChannel(this._messageReception.bind(this));
        this._initTimeout();
        this._sendNextGuess();
    }

    shutdown() {
        this.guessingChannel.currentCase = null;
        this.guessingChannel.unlockChannel();
    }

    /**
     * @param {DiscordMessage} message
     * @param {Bot} context
     * @private
     */
    async _messageReception(message, context) {
        if (!message.author || message.author.id !== this.userId)
            return; // Ignore everyone else

        clearTimeout(this.expertRunTimeout);
        this.expertRunTimeout = null;
        const [accepted, _] = this.guessingChannel.tryGuess(message.content);
        if (accepted) {
            if (this.pool.length > 0) {
                this.guessingChannel.newCase(this.pool);
                this._initTimeout();
                this._sendNextGuess();
            } else {
                const displayName = message.member ? message.member.displayName : message.author.username;
                this.shutdown();
                const embed = new MessageEmbed()
                    .setTitle(`\ud83c\udf89 Expert run completed!`)
                    .setColor(0x00ff00)
                    .setDescription(
                        `Congratulations ${displayName}! You've guessed all and you are now an **EXPERT**!\n` +
                        `\ud83d\ude2e You made only ${this.failures} mistakes!\n`
                    );
                message.channel.send(embed).then();
            }
        } else {
            this.failures += 1;
            if (this.failures >= this.maxFailures) {
                const guessCase = this.guessingChannel.currentCase;
                this.shutdown();
                const embed = new MessageEmbed()
                    .setTitle(`${WRONG} Expert run failed!`)
                    .setColor(0xff0000)
                    .setDescription(
                        `You made ${this.failures} mistakes!\n` +
                        `The last solution was: ${guessCase.solution}`
                    );
                message.channel.send(embed).then();
            } else {
                message.channel.send(`*Failures: **${this.failures}***`).then();
                this._initTimeout();
            }
        }
    }

    _timeOut() {
        const guessCase = this.guessingChannel.currentCase;
        this.timeout = null;
        this.shutdown();
        const embed = new MessageEmbed()
            .setTitle(`${WRONG} Expert run failed!`)
            .setColor(0xff0000)
            .setDescription(
                `\u23f2 You ran out of time to answer!\n` +
                `The last solution was: ${guessCase.solution}\n`
            );
        this.guessingChannel.channel.send(embed).then();
    }

    _initTimeout() {
        clearTimeout(this.timeout);
        if (!this.guessingChannel.currentCase) return;
        const millis = this.baseTime + this.timePerChar * this.guessingChannel.currentCase.solution.length;
        this.timeout = setTimeout(this._timeOut.bind(this), millis);
    }

    _sendNextGuess() {
        const key = this.guessingChannel.currentExpertKey();
        const millis = this.baseTime + this.timePerChar * this.guessingChannel.currentCase.solution.length;
        const msg = key +
            `\n\n*Available time: **${Math.round(millis/100)/10}s***\n` +
            `*Remaining flags: ${this.pool.length + 1}*\n` +
            `*Failures: **${this.failures}***`;
        this.guessingChannel.channel.send(msg).then();
    }
}

/**
 * @template Item
 * @property {Item} item
 * @property {string} solution
 * @property {number} attempts
 * @property {number} hints
 * @property {moment} creationTime
 * @property {moment} lastHintTime
 * @property {boolean} guessed
 */
class GuessCase {
    /**
     * @param {Item} item
     * @param {string} solution
     */
    constructor(item, solution) {
        this.item = item;
        this.solution = solution;
        this.attempts = 0;
        this.hints = 0;
        this.knownChars = new Set();

        this.creationTime = moment();
        this.lastHintTime = null;
        this.guessed = false;
    }

    /**
     * Tries to guess this case with the given string
     * @param {string} guess
     * @return {[boolean, number|null]} true if it gets accepted or false if it doesn't or if it has been already guessed,
     * the number is the number of mistakes in the guess or null if it was already guessed
     */
    tryGuess(guess) {
        if (this.guessed) return [false, null];
        const mistakes = this.mistakesInGuess(guess)
        this.attempts += 1;
        const valid = mistakes === 0;
        if (valid) this.guessed = true;
        return [valid, mistakes];
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
        const letters = this.solution.split("")
            .map((l, i) => [l, i])
            .filter(pair => pair[0].match(/[A-Za-z]/) && !this.knownChars.has(pair[1]))
            .map(pair => pair[1]);
        let howMany = Math.round(letters.length / (5 + Math.random() * 5));
        if (howMany === 0) howMany = 1;
        howMany = Math.min(howMany, letters.length);
        let count = 0;
        while (count < howMany) {
            const next = Math.floor(Math.random() * letters.length);
            this.knownChars.add(letters.splice(next, 1)[0]);
            count++;
        }
        this.lastHintTime = moment();
        this.hints++;
        return this.solution.split("").map(
            (v, i) => this.knownChars.has(i) || v.match(/[^A-Za-z]/) ? v + " " : "\\_ "
        ).join("");
    }

    /**
     * Scores a given guess based on the number of wrong characters per word,
     * giving an idea of how mistaken the guess is.
     * @param {string} guess the string we want to score as a guess
     * @returns {number}
     */
    mistakesInGuess(guess) {
        guess = normalize(guess);
        const right = normalize(this.solution);
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
}

module.exports = {
    GuessingController,
    GuessingChannel,
    GuessCase,
    GuessSpeedRun,
    GuessExpertRun,
    DEFAULT_SPEEDRUN_LENGTH
};
