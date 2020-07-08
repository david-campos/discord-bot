const {BaseChannelState} = require("../main/channel_state");
const {ChannelStateManager} = require("../main/channel_state");
const fs = require('fs');

class AhorcadoController {
    constructor() {
        /** @type {ChannelStateManager<AhorcadoChannel>} */
        this.stateManager = new ChannelStateManager(
            (channel, bot) => new AhorcadoChannel(channel, bot, this)
        );
    }

    /**
     * @param {module:"discord.js".Message} message
     * @param {string[]} args
     * @param {Bot} context
     */
    cmdNewWord(message, args, context) {
        const state = this.stateManager.getOrGenerateState(message, context);
        state.newWord();
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
    }

    newWord() {
        fs.readFile(__dirname + '/palabras.txt', 'utf8', (err, data) => {
            if (err) {
                console.error(err);
                return;
            }
            const words = data.split('\n');
            let idx = Math.round(Math.random() * (words.length - 1));
            while (words[idx].length < 2) {
                idx = (idx + 1) % words.length;
            }
            this.currentWord = words[idx];
        });
    }
}

module.exports = {
    AhorcadoController
};
