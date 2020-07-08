const {BaseChannelState} = require("../main/channel_state");
const {ChannelStateManager} = require("../main/channel_state");
const {MessageEmbed, MessageAttachment} = require('discord.js');
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

    async start() {
        await this.newWord();
        await this.sendCurrentState();
    }

    async sendCurrentState() {
        const word = normalize(this.currentWord).split('')
            .map((c, idx) =>
                this.letters.includes(c) || c === ' '
                    ? this.currentWord[idx]
                    : '_')
            .join(' ');
        const embed = new MessageEmbed()
            .setTitle(`${emoji.GAME_DIE} ${word}`)
            .setColor(0x1294f7)
            .setDescription(`Letras usadas: ${this.letters.map(l => l.toUpperCase()).join(', ')}`);
        const attachment = new MessageAttachment(__dirname + '/test.jpg');
        await this.channel.send(embed, attachment);
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
                this.currentWord = words[idx];
                this.letters = [];
                resolve();
            });
        });
    }
}

module.exports = {
    AhorcadoController
};
