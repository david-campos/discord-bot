const {BaseChannelState} = require("../main/channel_state");
const {ChannelStateManager} = require("../main/channel_state");
const {MessageAttachment} = require('discord.js');
const fs = require('fs');
const {normalize} = require("../generic/text");
const emoji = require("../emojis2");
const {Logger} = require("../logging/logger");
const {popRandomElement} = require("../generic/array");
const {apelativoRandom} = require("../main/apelativos");
const path = require('path');

const logger = new Logger(path.basename(__filename, '.js'));

const REQUIRED_PLAYERS = 2;

class GameController {
    constructor() {
        /** @type {ChannelStateManager<GameInstance>} */
        this.stateManager = new ChannelStateManager(
            (channel, bot, key) => new GameInstance(key, channel, bot, this)
        );

        this.cmdStartGame = this._requiresGameCreated.bind(this, this.cmdStartGame.bind(this));
        this.cmdJoinGame = this._requiresGameCreated.bind(this, this.cmdJoinGame.bind(this));
        this.cmdLeaveGame = this._requiresGameCreated.bind(this, this.cmdLeaveGame.bind(this));
    }

    /**
     * @param {[string, string, string]} commandNames - [join, leave, start]
     * @param {module:"discord.js".Message} message
     * @param {string[]} args
     * @param {Bot} context
     */
    async cmdNewGame(commandNames, message, args, context) {
        if (['dm', 'unknown'].includes(message.channel.type)) {
            message.reply(`Invalid channel, ${apelativoRandom()}.`);
            return;
        }
        const game = this.stateManager.getOrGenerateState(message, context);
        if (game.author) {
            await message.channel.send('Game already created.');
        } else {
            game.setAuthor(message.author);
            const [join, leave, start] = commandNames;
            const pref = context.config.prefix;
            await message.channel.send(`New game of **Unknown Game** created by ${message.member.displayName}.

Use \`${pref}${join}\` to join the game. If you wish to leave the game use \`${pref}${leave}\`.

The game will start when ${message.member.displayName} introduces \`${pref}${start}\`.`);
        }
    }

    /**
     * @param {module:"discord.js".Message} message
     * @param {string[]} args
     * @param {Bot} context
     */
    async cmdJoinGame(message, args, context) {
        const game = this.stateManager.getOrGenerateState(message, context);
        try {
            game.join(message.author);
            await message.react(emoji.OK_BUTTON);
        } catch (e) {
            await this._replyOrThrow({
                'started': 'the game has already started.',
                'already-in': `you have already joined, ${apelativoRandom()}.`
            }, message, e);
        }
    }

    /**
     * @param {module:"discord.js".Message} message
     * @param {string[]} args
     * @param {Bot} context
     */
    async cmdLeaveGame(message, args, context) {
        const game = this.stateManager.getOrGenerateState(message, context);
        try {
            game.leave(message.author);
            await message.react(emoji.WAVING_HAND);
        } catch (e) {
            await this._replyOrThrow({
                'started': 'the game has already started.',
                'author': 'you can\'t leave the game, you are the creator.',
                'not-in': `you are already in, ${apelativoRandom()}.`,
            }, message, e);
        }
    }

    /**
     * @param {module:"discord.js".Message} message
     * @param {string[]} args
     * @param {Bot} context
     */
    async cmdStartGame(message, args, context) {
        const game = this.stateManager.getOrGenerateState(message, context);
        if (message.author === game.author) {
            try {
                await game.start();
                await message.channel.send('Game started.');
            } catch (e) {
                await this._replyOrThrow({
                    'not-enough-players': `the number of players is not enough (${game.players.length}/${REQUIRED_PLAYERS})!`,
                }, message, e);
            }
        } else {
            await message.reply('only the author can start the game.');
        }
    }

    /**
     * @param {ChannelStateKey} key
     */
    removeGame(key) {
        this.stateManager.removeState(key);
    }

    /**
     * @param callback
     * @param {module:"discord.js".Message} message
     * @param {string[]} args
     * @param {Bot} context
     */
    async _requiresGameCreated(callback, message, args, context) {
        if (!this.stateManager.hasState(message)) {
            await message.reply('no game has been created');
        } else {
            await callback(message, args, context)
        }
    }

    async _replyOrThrow(replies, message, error) {
        if ((typeof error) === 'string' && (error in replies)) {
            await message.reply(replies[error]);
        } else {
            throw error;
        }
    }
}

class GameInstance extends BaseChannelState {
    /**
     * @param {string} key
     * @param {module:"discord.js".GuildChannel} channel
     * @param {Bot} bot
     * @param {GameController} controller
     */
    constructor(key, channel, bot, controller) {
        super(channel, bot, key);
        this.controller = controller;
        this.started = false;
        /** @type {module:"discord.js".User} */
        this.author = null;
        /** @type {module:"discord.js".User[]} */
        this.players = [];
        /** @type {Map<string, Role>} */
        this.roles = new Map();
        /** @type {Map<string, module:"discord.js".DMChannel> */
        this.dmChannels = new Map();
    }

    setAuthor(author) {
        this.author = author;
        this.players.push(author);
    }

    /**
     * @param {module:"discord.js".User} user
     */
    join(user) {
        if (this.started) throw 'started';
        if (this.players.includes(user)) throw 'already-in';
        this.players.push(user);
    }

    leave(user) {
        if (this.started) throw 'started';
        if (user === this.author) throw 'author';
        const idx = this.players.indexOf(user);
        if (idx < 0) throw 'not-in';
        this.players.splice(idx, 1);
    }

    /**
     * @param {module:"discord.js".Message} msg
     */
    onMessage(msg) {
        if (msg.author.bot) return;
        if (msg.author === this.author) {
            this.finish();
        }
    }

    /**
     * @param {module:"discord.js".Message} msg
     */
    onPrivateMessage(msg) {
        if (msg.author.bot) return;
        const words = msg.content.split(' ');
        if (words.length > 0) {
            const firstWord = words[0];
            const availableActions = this.roles.get(msg.author.id).actions;
            const action = availableActions.find(action => action.id === firstWord);
            if (action) {
                action.execute(this, msg);
            }
        } else {
            msg.reply(apelativoRandom()).then();
        }
    }

    async start() {
        if (this.players.length < REQUIRED_PLAYERS) throw 'not-enough-players';
        this._assignRoles();
        await this._createDmChannels();
        this._sendRoles().then();
        this.started = true;
        this.lockChannel(this.onMessage.bind(this));
        for (let player of this.players) {
            this.context.lockMessageReception(player.dmChannel, this.onPrivateMessage.bind(this));
        }
    }

    finish() {
        this.unlockChannel();
        for (let player of this.players) {
            this.context.unlockMessageReception(player.dmChannel);
        }
        this.started = false;
        this.controller.removeGame(this.key);
    }

    _assignRoles() {
        if (this.started) return;
        const roles = this._createRoles();
        for (let player of this.players) {
            this.roles.set(player.id, popRandomElement(roles));
        }
    }

    async _createDmChannels() {
        if (this.dmChannels.size > 0) return;
        const dms = await Promise.all(this.players.map(p => p.createDM()));
        for (let i = 0; i < this.players.length; ++i) {
            this.dmChannels.set(this.players[i].id, dms[i]);
        }
    }

    async _sendRoles() {
        if (this.roles.size === 0) return;
        for (let player of this.players) {
            await this.dmChannels.get(player.id)
                .send(`Your role: ${this.roles.get(player.id).roleName}`);
        }
    }

    /**
     * @private
     * @return {Role[]} the roles
     */
    _createRoles() {
        return [
            new Police(),
            new Assasin(),
            new Merchant(),
            new Rogue()
        ];
    }
}

class Action {
    constructor(id) {
        this.id = id;
    }

    /**
     * @param {GameInstance} gameInstance
     * @param {module:"discord.js".Message} message
     */
    execute(gameInstance, message) {
        throw new Error('Action::execute not implemented.');
    }
}

class SellAction extends Action {
    constructor() {
        super('sell');
    }

    async execute(gameInstance, message) {
        const target = message.mentions.users.first();
        if (!target) {
            await message.reply('You need to mention the user you want to sell to.');
            return;
        }
        if (!gameInstance.players.includes(target)) {
            await message.reply('The target user is not playing!');
            return;
        }
        /** @type {module:"discord.js".GuildChannel} */
        const guildChannel = gameInstance.channel;
        const authorName = guildChannel.members.get(message.author.id).displayName;
        await target.send(`${authorName} wants to sell you something. Do you wish to accept?`);
        logger.log('SellAction performed: mensaje enviado TT, nano, fiera.');
    }
}

class Role {
    /**
     * @param {string} roleName
     * @param {Action[]} actions
     */
    constructor(roleName, actions) {
        this.roleName = roleName;
        this.actions = actions;
    }
}

const SELL_ACTION = new SellAction();

class Police extends Role {
    constructor() {
        super('Police', [SELL_ACTION]);
    }
}

class Assasin extends Role {
    constructor() {
        super('Assasin', [SELL_ACTION]);
    }
}

class Merchant extends Role {
    constructor() {
        super('Merchant', [SELL_ACTION]);
    }
}

class Rogue extends Role {
    constructor() {
        super('Rogue', [SELL_ACTION]);
    }
}

module.exports = {
    GameController
};
