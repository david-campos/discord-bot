const {BaseChannelState} = require("../main/channel_state");
const {ChannelStateManager} = require("../main/channel_state");
const {MessageAttachment} = require('discord.js');
const fs = require('fs');
const {normalize} = require("../generic/text");
const emoji = require("../emojis2");

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
    async cmdNewWord(message, args, context) {
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
    }

    /**
     * @param {module:"discord.js".Message} msg
     */
    onMessage(msg) {
        if (msg.author.bot) return;
        if (msg.content === emoji.STOP_SIGN) {
            this.cancel();
            return;
        }
        if (msg.content.length !== 1) return;
        const char = msg.content.toLowerCase();
        if (char >= 'a' && char <= 'z') {
            if (this.letters.includes(char)) {
                msg.react(emoji.REPEAT_BUTTON);
            } else {
                this.letters.push(char);
                if (normalize(this.currentWord).includes(char)) {
                    msg.react(emoji.CHECK_BOX_WITH_CHECK);
                    this.sendCurrentState();
                } else {
                    msg.react(emoji.DOUBLE_EXCLAMATION_MARK);
                }
            }
        }
    }

    async start() {
        await this.newWord();
        await this.sendCurrentState();
        this.lockChannel(this.onMessage.bind(this));
    }

    cancel() {
        this.currentWord = null;
        this.unlockChannel();
    }

    async sendCurrentState() {
        const word = normalize(this.currentWord).split('')
            .map((c, idx) =>
                `**${this.letters.includes(c) || c === ' '
                    ? this.currentWord[idx]
                    : '_'}**`)
            .join(' ');
        // const attachment = new MessageAttachment(__dirname + '/test.jpg');
        await this.channel.send(
            `${emoji.GAME_DIE} ${word}\nLetras usadas: ${this.letters.map(l => l.toUpperCase()).join(', ')}`
            /*, attachment*/);
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
                resolve();
            });
        });
    }
}

module.exports = {
    AhorcadoController
};
