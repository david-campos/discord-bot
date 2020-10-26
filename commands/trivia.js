const axios = require('axios');
const {MessageEmbed} = require('discord.js');
const {MEDALS, RIGHT, WRONG, OK, FREE, LETTER_EMOJI_PRE, A_EMOJI_BASE} = require('../guess_quizz/emojis');
const moment = require('moment');

const DIFFICULTY_EMOJI = {
    "easy": "\ud83d\ude0c",
    "medium": "\ud83e\udd14",
    "hard": "\ud83e\udd2f"
};

const DIFFICULTY_COLORS = {
    "easy": 0x00ff00,
    "medium": 0xffff00,
    "hard": 0xff0000
};

function decodeBase64(text) {
    let buff = Buffer.from(text, 'base64');
    return buff.toString('utf8');
}

const path = require('path');
const {Logger} = require("../logging/logger");
const logger = new Logger(path.basename(__filename, '.js'));

let categoriesCache = null;

class Question {
    /**
     * @param {{difficulty: string, incorrect_answers: string[], type: string,
     *  correct_answer: string, category: string, question: string}} codedQuestion
     */
    constructor(codedQuestion) {
        this.difficulty = decodeBase64(codedQuestion.difficulty);
        this.answers = codedQuestion.incorrect_answers.slice(0);
        this.rightAnswerIndex = Math.round(Math.random() * this.answers.length);
        this.answers.splice(this.rightAnswerIndex, 0, codedQuestion.correct_answer);
        this.answers = this.answers.map(ans => decodeBase64(ans));
        this.category = decodeBase64(codedQuestion.category);
        this.question = decodeBase64(codedQuestion.question);
    }

    isCorrect(answer) {
        const index = answer.toLowerCase().charCodeAt(0) - 'a'.charCodeAt(0);
        return this.rightAnswerIndex === index;
    }

    /**
     * @returns {module:"discord.js".MessageEmbed}
     */
    getEmbed() {
        // noinspection JSCheckFunctionSignatures
        return new MessageEmbed()
            .setTitle(DIFFICULTY_EMOJI[this.difficulty] + ' ' + this.category)
            .setColor(DIFFICULTY_COLORS[this.difficulty])
            .setDescription(
                `**${this.question}**\n\n`
                + this.answers.map((answer, index) =>
                    `${LETTER_EMOJI_PRE + String.fromCharCode(A_EMOJI_BASE + index)}  ${answer}`)
                    .join("\n")
            );
    }
}

class QuestionGame {
    /**
     * @param {ChannelState} channelState
     * @param {module:"discord.js".User} author
     * @param {number} questions
     */
    constructor(channelState, author, questions) {
        this.token = null;
        this.channelState = channelState;
        this.numQuestions = questions;
        /** @type {[module:"discord.js".User]} */
        this.participants = [author];
        this.turn = 0;
        this.author = author;
        /** @type {{player: number, correct: boolean}[]} */
        this.answers = [];
        this.started = false;
        this.finished = false;
        /** @type {Question|null} */
        this.currentQuestion = null;
    }

    /**
     * @param {module:"discord.js".User} user
     * @return {boolean} true if the participant has been added, false if it has been removed
     */
    toggleParticipant(user) {
        if (this.started || this.finished) throw new Error('the game has already started.');
        if (this.author.id === user.id) throw new Error(`${user.username} can't be toggled, she/he is the author.`);
        const foundIndex = this.participants.findIndex(participant => participant.id === user.id);
        if (foundIndex >= 0) {
            this.participants.splice(foundIndex, 1);
            return false;
        } else {
            this.participants.push(user);
            return true;
        }
    }

    async start() {
        if (this.started || this.finished) return;

        this.started = true;
        this.channelState.lockChannel(this.answerReception.bind(this));
        this.channelState.checkCategoriesInBatch().then(); // async is fine
        await this.nextQuestion();
    }

    /** @param {module:"discord.js".Message} message */
    answerReception(message) {
        if (!this.started || this.finished || !this.currentQuestion) return; // Ignore
        if (!message.author || message.author.bot) return;
        const answer = message.content.trim().toLowerCase();
        if (answer.length !== 1) {
            if (answer === "\ud83d\udd1a") this.finishGame(`Game cancelled by <@${message.author.id}>`);
            return;
        }
        if (answer.charCodeAt(0) < "a".charCodeAt(0)
            || answer.charCodeAt(0) > "a".charCodeAt(0) + this.currentQuestion.answers.length - 1) return; // Not an answer
        const foundIndex = this.participants.findIndex(participant => participant.id === message.author.id);
        if (foundIndex !== this.turn) return; // Not a participant or current turn
        const correct = this.currentQuestion.isCorrect(answer);
        const rightIndex = this.currentQuestion.rightAnswerIndex;
        this.answers.push({player: foundIndex, correct: correct});
        message.react(correct ? RIGHT : WRONG).then(() => message.react(
            LETTER_EMOJI_PRE + String.fromCharCode(A_EMOJI_BASE + rightIndex)
        ));
        if (this.answers.length < this.numQuestions) {
            this.turn = (this.turn + 1) % this.participants.length;
            this.nextQuestion().then(() => message.channel.send(this.getEmbed()));
        } else {
            this.finishGame(`You, cheeky smarties, have answered all the questions!`);
        }
    }

    /**
     * @param {string} reason
     */
    finishGame(reason) {
        this.finished = true;
        this.channelState.unlockChannel();
        this.channelState.onGoingGame = null; // Bye bye!
        const fields = this.participants
            .map((p, pIdx) => {
                const answered = this.answers.filter(a => a.player === pIdx);
                const right = answered.filter(a => a.correct).length;
                const wrong = answered.length - right;
                return [{
                    name: p.username,
                    value: `${RIGHT} Right: **${right}**. ${WRONG} Wrong: **${wrong}**`,
                    inline: true
                }, right]
            })
            .sort((a, b) => -(a[1] - b[1]))
            .map(arr => arr[0]);
        // Add medals
        fields.slice(0, MEDALS.length).forEach((f, i) => f.name = `${MEDALS[i]} ${f.name}`);
        const embed = new MessageEmbed()
            .setTitle('\ud83c\udfc1 Game finished!')
            .setDescription(reason)
            .addFields(...fields);
        this.channelState.channel.send(embed).then();
    }

    async nextQuestion() {
        this.currentQuestion = null;
        this.currentQuestion = await this.channelState.getNextQuestion(this.numQuestions - this.answers.length);
    }

    /** @return {module:"discord.js".MessageEmbed|null} */
    getEmbed() {
        if (!this.currentQuestion) return null;
        const embed = this.currentQuestion.getEmbed();
        const player = this.participants[this.turn];
        embed.setTitle(`Question ${this.answers.length + 1}/${this.numQuestions}: ${embed.title}`);
        embed.setFooter(player.username, player.displayAvatarURL());
        return embed;
    }
}

class ChannelState {
    /**
     * @param {module:"discord.js".TextBasedChannel<Channel>} channel
     * @param {Bot} context
     */
    constructor(channel, context) {
        this.channel = channel;
        this.context = context;
        this.questionBatch = [];
        this.cachedForLater = []; // not in the current categories but may be valid for later
        this.categories = [];
        this.categoryNames = [];
        this.fetchingQuestions = false;
        /** @type {{resolve: function(PromiseLike<void>?):void, reject: function(any):void}[]} */
        this.resolveOnFetched = [];
        /** @type {QuestionGame} */
        this.onGoingGame = null;
    }

    changeCategories(categories) {
        const newCategories = categories.map(c => c.id);
        const oldCategories = this.categories.map(c => c.id);
        const diff = newCategories
            .filter(id => !oldCategories.includes(id))
            .concat(oldCategories.filter(id => !newCategories.includes(id)))
            .length;
        if (diff > 0) {
            this.categories = categories;
            this.categoryNames = categories.map(c => c.name);
            if (this.categories.length > 0) {
                // Leave in cached the unnecessary ones
                const all = this.cachedForLater.concat(this.questionBatch)
                    .map(q => [q, this.categoryNames.includes(q.category)]);
                this.cachedForLater = all.filter(([_, validCategory]) => !validCategory).map(([q]) => q);
                this.questionBatch = all.filter(([_, validCategory]) => validCategory).map(([q]) => q);
            } else {
                this.questionBatch = this.questionBatch.concat(this.cachedForLater);
                this.cachedForLater = [];
            }
            logger.log(`Categories change: ${this.cachedForLater.length} cached for later and ${this.questionBatch.length} used.`)
        }
    }

    lockChannel(callback) {
        this.context.lockMessageReception(this.channel, callback);
    }

    unlockChannel() {
        this.context.unlockMessageReception(this.channel);
    }

    /**
     * @returns {Question}
     */
    async getNextQuestion(questionsLeft) {
        if (this.questionBatch.length > 0) {
            const question = this.questionBatch.shift();
            if (this.categories.length === 0
                || this.categoryNames.includes(question.category))
                return question;
            else {
                this.cachedForLater.push(question);
                return this.getNextQuestion(questionsLeft);
            }
        } else {
            await this.fetchNewQuestions(questionsLeft);
            return this.getNextQuestion(questionsLeft);
        }
    }

    /**
     * Checks that we have a mix of the categories in the batch
     */
    async checkCategoriesInBatch(questionsLeft) {
        const filteredCategories = this.questionBatch
            .map(q => q.category)
            .filter(c => this.categoryNames.includes(c))
            .filter((c, idx, array) => array.indexOf(c) === idx)
            .length;
        logger.log(`Checking categories: ${filteredCategories}`);
        if (filteredCategories <= 0) return; // we are fine, next get will get the necessary ones
        if (filteredCategories < this.categories.length) {
            await this.fetchNewQuestions(Math.max(
                questionsLeft - this.questionBatch.length,
                Math.ceil(questionsLeft / this.categories.length)
            )); // fetch some questions and mix them
        }
    }

    async fetchNewToken() {
        logger.log('Fetching new token...');
        const response = await axios.get("https://opentdb.com/api_token.php?command=request");
        if (response.data.response_code === 0) {
            this.token = response.data.token;
            logger.log(`Fetched new token: ${this.token}`);
        } else {
            logger.error(response.data);
            throw new Error('Could not fetch a new token');
        }
    }

    async resetToken() {
        if (!this.token) return;
        logger.log(`Resetting token...`);
        const response = await axios.get(`https://opentdb.com/api_token.php?command=reset&token=${this.token}`);
        if (response.data.response_code !== 0) {
            logger.error(response.data);
            throw new Error('Could not reset token.');
        } else {
            logger.log('Token reset.');
        }
    }

    async fetchNewQuestions(totalAmount) {
        if (this.fetchingQuestions) {
            // Wait for fetch to end
            logger.log('Fetch going on, wait to end.');
            await new Promise((resolve, reject) =>
                this.resolveOnFetched.push({resolve: resolve, reject: reject}));
            return;
        }
        this.fetchingQuestions = true; // lock
        if (!this.token) await this.fetchNewToken();
        try {
            if (this.categories.length === 0) {
                await this._fetchQuestionsForCategory(totalAmount, null);
            } else {
                const partialAmount = Math.ceil(totalAmount / this.categories.length);
                const startingCategory = Math.round(Math.random() * (this.categories.length - 1));
                let obtained = 0;
                const promises = [];
                for (let i = startingCategory; obtained < totalAmount; i = (i + 1) % this.categories.length) {
                    promises.push(this._fetchQuestionsForCategory(partialAmount, this.categories[i]));
                    obtained += partialAmount;
                }
                await Promise.all(promises);
            }
            this.fetchingQuestions = false; // unlock
            this.resolveOnFetched.forEach(obj => obj.resolve());
            this.resolveOnFetched = [];
        } catch (e) {
            this.fetchingQuestions = false; // unlock
            if (e.response_code === 4) {
                await this.resetToken();
                await this.fetchNewQuestions();
            } else {
                this.resolveOnFetched.forEach(obj => obj.reject(e));
                this.resolveOnFetched = [];
                logger.error(e);
                throw e;
            }
        }
    }

    async _fetchQuestionsForCategory(amount, category) {
        if (!this.token) throw Error('token should have been fetched before calling this method');
        amount = Math.min(amount, 50); // API does not allow for more than 50 questions
        const urlParams = `amount=${amount}&encode=base64&token=${this.token}${
            category ? `&category=${category.id}` : ''
        }`;
        logger.log(`Fetching questions (amount: ${amount}, category: ${category ? category.name : 'any'})`);
        const response = await axios.get(`https://opentdb.com/api.php?${urlParams}`);
        if (response.data.response_code === 0) {
            const questions = response.data.results.map(q => new Question(q));
            // mix randomly
            for (const q of questions) {
                const idx = Math.round(Math.random() * this.questionBatch.length);
                this.questionBatch.splice(idx, 0, q);
            }
        } else {
            throw response.data;
        }
    }
}

/** @type {Map<string, ChannelState>} */
const channelStates = new Map();

/**
 * @param {module:"discord.js".Message} message
 * @param {Bot} context
 * @return {ChannelState|null}
 */
function getOrGenerateState(message, context) {
    if (message.channel.type === 'news') return null;
    if (channelStates.has(message.channel.id)) {
        return channelStates.get(message.channel.id);
    } else {
        const state = new ChannelState(message.channel, context);
        channelStates.set(message.channel.id, state);
        return state;
    }
}

module.exports = {
    commands: [{
        name: 'trivia',
        shortDescription: 'Juego de preguntas (en inglés)',
        description: 'Creates a new game of trivia questions (using opentdb.com), '
            + 'joins the current proposed game or starts the game.',
        usage: [
            {
                subcommand: 'Create', description: 'Create a new game', args: [{
                    name: 'nQ',
                    description: 'number of questions for the game to propose (when proposing a new game)',
                    format: 'integer greater than zero',
                    defaultValue: '10'
                }, {
                    name: 'categories',
                    description: 'category or categories of the questions, separated by commas',
                    format: 'name or category id',
                    defaultValue: 'any category'
                }]
            },
            {
                subcommand: 'Join', description: 'Join a game', args: [{
                    name: 'join',
                    isLiteral: true
                }]
            },
            {
                subcommand: 'Cancel', description: 'Cancel a proposed game', args: [{
                    name: 'cancel',
                    isLiteral: true
                }]
            },
            {
                subcommand: 'Start', description: 'Start the proposed game', args: [{
                    name: 'start',
                    isLiteral: true
                }]
            }
        ],
        /**
         * @param {module:"discord.js".Message} message
         * @param {string[]} args
         * @param {Bot} context
         */
        async execute(message, args, context) {
            const state = getOrGenerateState(message, context);
            if (state.onGoingGame) {
                if (args.length < 1) {
                    if (state.onGoingGame.author.id === message.author.id)
                        message.reply('use `join` to join, `start` to start the game or `cancel` to cancel it.');
                    else
                        message.reply('use `join` to join or `cancel` to cancel the game.');
                } else {
                    try {
                        const option = args[0].toLowerCase();
                        if (option === "cancel") {
                            state.onGoingGame = null;
                            message.reply('trivia game cancelled.');
                        } else if (option === "join") {
                            const added = state.onGoingGame.toggleParticipant(message.author);
                            await message.react(added ? OK : FREE);
                        } else if (option === "start") {
                            if (state.onGoingGame.author.id === message.author.id)
                                state.onGoingGame.start()
                                    .then(() => message.channel.send(state.onGoingGame.getEmbed()));
                            else
                                message.reply('only the author of the proposal can start the game.');
                        }
                    } catch (err) {
                        logger.log(err);
                        message.reply(err.message);
                    }
                }
            } else {
                let questions = 10;
                if (!isNaN(parseInt(args[0], 10)) && parseInt(args[0], 10) > 0) {
                    questions = parseInt(args[0], 10);
                }
                /** @type {{id: number, name: string}[]} */
                let categoryObjs = [];
                if (args.length > 1) {
                    let categories;
                    if (categoriesCache === null || moment().diff(categoriesCache[0], 'hours') > 24) {
                        const response = await axios.get('https://opentdb.com/api_category.php');
                        if (!response.data.trivia_categories) {
                            message.channel.send('Error trying to retrieve categories to check.').then();
                            return;
                        }
                        categories = response.data.trivia_categories;
                        categoriesCache = [moment(), categories]
                    } else {
                        categories = categoriesCache[1];
                    }
                    const category = args.slice(1).join(' ').split(',').map(p => p.trim().toLocaleLowerCase());
                    categoryObjs = categories.filter(c => category.includes(
                        c.name.toLocaleLowerCase()) || category.includes(c.id.toString()));
                    if (categoryObjs.length < category.length) {
                        const invalid = category.filter(
                            cat => !categories.find(
                                c => c.name.toLocaleLowerCase() === cat.toLocaleLowerCase() || cat === c.id.toString()
                            )
                        ).map(
                            cat => `\`${cat}\``
                        ).join(', ');
                        message.channel.send(`**Invalid categories: ${invalid}. These are the valid ones (can be referenced by name or number):**\n` +
                            `${categories.map(c => `${c.id}) ${c.name}`).join("\n")}`
                        ).then();
                        return
                    }
                }
                state.changeCategories(categoryObjs);
                state.onGoingGame = new QuestionGame(state, message.author, questions);
                const embed = new MessageEmbed()
                    .setTitle('\ud83d\udcda Trivia game!')
                    .setDescription(
                        `${message.author.username} has proposed a trivia game with ${questions} questions${
                            categoryObjs.length > 0 ? ` from the categor${categoryObjs.length > 1 ? 'ies' : 'y'} ${
                                categoryObjs.map(obj => `*${obj.name}*`).join(', ')
                            }` : ''
                        }!\n`
                        + `**Send \`${context.config.prefix}trivia join\` to join or leave.**\n`
                        + `*The game will start when ${message.author.username} `
                        + `introduces \`${context.config.prefix}trivia start\`.*\n\n`
                        + `Send \`${context.config.prefix}trivia cancel\` to cancel the game.`
                    )
                message.channel.send(embed).then();
            }
        }
    }]
}
