const {BaseChannelState} = require("../main/channel_state");
const {ChannelStateManager} = require("../main/channel_state");
const {MessageAttachment} = require('discord.js');
const fs = require('fs');
const {normalize} = require("../generic/text");
const emoji = require("../emojis2");
const {apelativoRandom} = require("../main/apelativos");

class AhorcadoController {
    constructor() {
        this.stateManager = new ChannelStateManager(
            (channel, bot) => new AhorcadoChannel(channel, bot, this)
        );
    }

    /**
     * @param {module:"discord.js".Message} message
     * @param {string[]} args
     * @param {Bot} context
     */
    async cmdNewGame(message, args, context) {
        const state = this.stateManager.getOrGenerateState(message, context);
        await state.start();
    }
}

class AhorcadoChannel extends BaseChannelState {
    /**
     * @param {DiscordChannel} channel
     * @param {Bot} bot
     * @param {AhorcadoController} controller
     */
    constructor(channel, bot, controller) {
        super(channel, bot);
        this.controller = controller;
        this.currentWord = null;
        this.letters = [];
        this.mistakes = 0;
        this.debounceTimeout = 0;
    }

    /**
     * @param {module:"discord.js".Message} msg
     */
    onMessage(msg) {
        if (msg.author.bot) return;
        if (msg.content === emoji.STOP_SIGN || !this.currentWord) {
            this.cancel();
            return;
        }
        const message = msg.content.toLowerCase();
        if (normalize(message) === normalize(this.currentWord)) {
            this.win();
            return;
        }
        if (message.length !== 1) return;
        if (message >= 'a' && message <= 'z') {
            if (this.letters.includes(message)) {
                msg.react(emoji.REPEAT_BUTTON);
            } else {
                this.letters.push(message);
                if (this.isComplete()) {
                    this.win();
                    return;
                }
                if (normalize(this.currentWord).includes(message)) {
                    msg.react(emoji.CHECK_BOX_WITH_CHECK);
                } else {
                    this.mistakes += 1;
                    msg.react(emoji.DOUBLE_EXCLAMATION_MARK);
                    if (this.mistakes >= 6) {
                        this.lose();
                        return;
                    }
                }
                clearTimeout(this.debounceTimeout);
                this.debounceTimeout = setTimeout(this.sendCurrentState.bind(this), 1000);
            }
        }
    }

    async start() {
        if (this.currentWord) {
            return;
        }
        await this.newWord();
        await this.sendCurrentState(true);
        this.lockChannel(this.onMessage.bind(this));
    }

    win() {
        this.channel.send(`${emoji.TROPHY} **Correcto!** La palabra era *${this.currentWord}*.`);
        this.finish();
    }

    lose() {
        this.channel.send(
            `${emoji.SKULL} **Fin del juego** La palabra era *${this.currentWord}*.`,
            this.attachmentForMistakes())
        this.finish();
    }

    finish() {
        this.currentWord = null;
        this.unlockChannel();
    }

    cancel() {
        this.channel.send(`${emoji.STOP_SIGN} Juego cancelado, ${apelativoRandom()}.`);
        this.finish();
    }

    attachmentForMistakes() {
        const picLevel = Math.max(Math.min(6, this.mistakes), 0).toString(10);
        return new MessageAttachment(`${__dirname}/ahorcado${picLevel}.png`);
    }

    isComplete() {
        return !normalize(this.currentWord)
            .split('')
            .find(c => !this.letters.includes(c) && c !== ' ');
    }

    async sendCurrentState(withCancel = false) {
        const word = normalize(this.currentWord).split('')
            .map((c, idx) =>
                `**${this.letters.includes(c) || c === ' '
                    ? this.currentWord[idx]
                    : '_'}**`)
            .join(' ');
        await this.channel.send(
            `${
                withCancel ? `Usa ${emoji.STOP_SIGN} para cancelar.\n` : ''
            }${emoji.CROSSED_SWORDS} ${word}\nLetras usadas: ${this.letters.map(l => l.toUpperCase()).join(', ')}`
            , this.attachmentForMistakes());
    }

    async newWord() {
        return new Promise((resolve, reject) => {
            fs.readFile(__dirname + '/palabras.txt', 'utf8', (err, data) => {
                if (err) {
                    console.error(err);
                    reject();
                    return;
                }
                const words = data.split('\n');
                let idx = Math.round(Math.random() * (words.length - 1));
                while (words[idx].length < 2) {
                    idx = (idx + 1) % words.length;
                }
                this.currentWord = words[idx][0].toLocaleUpperCase() + words[idx].substring(1);
                this.letters = [];
                this.mistakes = 0;
                resolve();
            });
        });
    }
}

module.exports = {
    AhorcadoController
};
