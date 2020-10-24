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
        /** @type {Map<string, Character>} */
        this.characters = new Map();
        /** @type {Map<string, module:"discord.js".DMChannel>} */
        this.dmChannels = new Map();
        /** @type {Map<string, [string, function<DiscordMessage>][]>}*/
        this.waitingActions = new Map();
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
        // Actions can set a callback waiting for a player to answer something
        const waitingActions = this.waitingActions.get(msg.author.id);
        if (waitingActions.length > 0) {
            const waiting = waitingActions[0];
            const [_, func] = waiting;
            if (func(msg)) {
                waitingActions.shift();
                if (waitingActions.length > 0)
                    msg.author.send(waitingActions[0][0]).then();
            }
            return;
        }
        // Checking action
        const words = msg.content.split(' ');
        if (words.length > 0) {
            const firstWord = words[0];
            const availableActions = this.characters.get(msg.author.id).actions;
            const action = availableActions.find(action => action.id === firstWord);
            if (action) {
                action.execute(this, msg);
                return;
            }
        }
        msg.reply(`That is not one of your actions, ${apelativoRandom()}`).then();
    }

    askToPlayer(player, msg, callback) {
        const waitingActions = this.waitingActions.get(player.id);
        if (waitingActions.length === 0)
            player.send(msg);
        waitingActions.push([msg, callback]);
    }

    async start() {
        if (this.players.length < REQUIRED_PLAYERS) throw 'not-enough-players';
        this._assignCharacters();
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

    _assignCharacters() {
        if (this.started) return;
        const roles = this._createCharacters();
        for (let player of this.players) {
            this.characters.set(player.id, popRandomElement(roles));
            this.waitingActions.set(player.id, []);
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
        if (this.characters.size === 0) return;
        for (let player of this.players) {
            await this.dmChannels.get(player.id)
                .send(`Your role: ${this.characters.get(player.id).roleName}`);
        }
    }

    /**
     * @private
     * @return {Character[]} the roles
     */
    _createCharacters() {
        return [
            new Police(),
            new Assasin()//,
            // new Merchant(),
            // new Rogue()
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
        super('offer');
    }

    async execute(gameInstance, message) {
        const parts = message.content.split(' ');
        if (parts.length > 1) {
            this.askWhatToSell(gameInstance, message.author, parts.slice(1)).then();
        } else {
            /** @type {module:"discord.js".GuildChannel} */
            const guildChannel = gameInstance.channel;
            gameInstance.askToPlayer(
                message.author,
                'Who do you want to exchange with?\n' +
                gameInstance.players
                    .filter(p => p !== message.author)
                    .map((p, i) =>
                        `${i + 1}) ${p.username}: ${guildChannel.members.get(p.id).displayName}`)
                    .join('\n'),
                msg => {
                    this.askWhatToSell(gameInstance, message.author, msg.content.split(' '));
                    return true;
                }
            );
        }
    }

    async askWhatToSell(gameInstance, seller, args) {
        /** @type {module:"discord.js".User} */
        const target = oneBasedIndexOrFind(
            gameInstance.players.filter(p => p !== seller),
            args[0],
            p => p.username === args[0],
            () => seller.send('Invalid number! Check the list.')
        );
        if (!target) {
            if (target === undefined)
                seller.send('The target user is not playing, check you wrote the right user name!').then();
            return;
        }
        if (args.length > 1) {
            await this.sell(gameInstance, seller, target, args.slice(1));
        } else {
            gameInstance.askToPlayer(
                seller,
                'What do you want to exchange?\n' +
                gameInstance.characters.get(seller.id)
                    .inventory
                    .map((item, idx) => `${idx + 1}) ${item.display}`)
                    .join('\n'),
                msg => {
                    this.sell(gameInstance, seller, target, msg.content.split(' '));
                    return true;
                }
            );
        }
    }

    async sell(gameInstance, seller, target, args) {
        const item = oneBasedIndexOrFind(
            gameInstance.characters.get(seller.id).inventory,
            args[0],
            item => item.display === args[0],
            () => seller.send('Invalid number! Check the list.')
        );
        if (!item) {
            if (item === undefined)
                seller.send(`The item ${args[0]} could not be found.`);
            return;
        }
        seller.send('Asking...');
        /** @type {module:"discord.js".GuildChannel} */
        const guildChannel = gameInstance.channel;
        const authorName = guildChannel.members.get(seller.id).displayName;
        gameInstance.askToPlayer(
            target,
            `${authorName} wants to exchange ${item.display} with you. Select an item (or \`free\`) to offer an exchange, or send \`no\` to refuse:\n` +
            gameInstance.characters.get(target.id)
                .inventory
                .map((item, idx) => `${idx + 1}) ${item.display}`)
                .join('\n'),
            msg => {
                const content = msg.content;
                const lower = content.toLocaleLowerCase();
                if (lower === 'no') {
                    /** @type {module:"discord.js".GuildChannel} */
                    const guildChannel = gameInstance.channel;
                    const nameTarget = guildChannel.members.get(target.id).displayName;
                    seller.send(`${emoji.CROSS_MARK} ${nameTarget} **refused** the exchange.`);
                    target.send(`${emoji.CROSS_MARK} you refused the exchange.`);
                } else if (lower === 'free') {
                    this.offerPayment(gameInstance, seller, target, item, null);
                    msg.react(emoji.CHECK_BOX_WITH_CHECK);
                } else {
                    const payment = oneBasedIndexOrFind(
                        gameInstance.characters.get(target.id).inventory,
                        content,
                        it => it.display === content,
                        () => target.send('Invalid number! Check the list.')
                    );
                    if (!payment) {
                        if (payment === undefined)
                            target.send(`The item ${content} could not be found. Still waiting for valid item, \`free\` or \`no\`.`);
                        return false;
                    }
                    this.offerPayment(gameInstance, seller, target, item, payment);
                    msg.react(emoji.CHECK_BOX_WITH_CHECK);
                }
                return true;
            }
        );
    }

    async offerPayment(gameInstance, seller, target, itemSeller, itemTarget) {
        /** @type {module:"discord.js".GuildChannel} */
        const guildChannel = gameInstance.channel;
        const nameTarget = guildChannel.members.get(target.id).displayName;
        const nameSeller = guildChannel.members.get(seller.id).displayName;
        const iconItemTarget = itemTarget ? itemTarget.display : '*nothing*';
        gameInstance.askToPlayer(
            seller,
            `${nameTarget} offers ${iconItemTarget} in exchange for ${itemSeller.display}. Do you wish to accept? (Y/N)`,
            msg => {
                const content = msg.content;
                const lower = content.toLowerCase();
                if (lower.startsWith('y')) {
                    target.send(`${emoji.CHECK_MARK_BUTTON} ${nameSeller} **accepted** to exchange ${itemSeller.display} for your ${iconItemTarget}.`);
                    seller.send(`${emoji.CHECK_MARK_BUTTON} **accepted**.`);
                    const characterSeller = gameInstance.characters.get(seller.id);
                    const characterTarget = gameInstance.characters.get(target.id);
                    characterSeller.giveItem(itemSeller, characterTarget);
                    if (itemTarget) characterTarget.giveItem(itemTarget, characterSeller);
                    return true;
                } else if (lower.startsWith('n')) {
                    target.send(`${emoji.CROSS_MARK} ${nameSeller} **refused** to exchange ${itemSeller.display} for your ${iconItemTarget}.`);
                    seller.send(`${emoji.CROSS_MARK} ${nameSeller} **refused**.`);
                    return true;
                } else {
                    seller.send(`Please, introduce Y or N.`);
                    return false;
                }
            }
        );
    }
}

class Item {
    constructor(display, desc) {
        this.display = display;
        this.desc = desc;
    }
}

class Character {
    /**
     * @param {string} roleName
     * @param {Action[]} actions
     * @param {Item[]} startingInventory
     */
    constructor(roleName, actions, startingInventory = []) {
        this.roleName = roleName;
        this.actions = actions;
        this.inventory = [].concat(startingInventory);
    }

    giveItem(item, characterTarget) {
        const idx = this.inventory.indexOf(item);
        if (idx >= 0) {
            characterTarget.inventory.push(this.inventory.splice(idx, 1)[0]);
        }
    }
}

const SELL_ACTION = new SellAction();

class Police extends Character {
    constructor() {
        super('Police', [SELL_ACTION], [
            new Item(emoji.CUPCAKE, 'a cupcake')
        ]);
    }
}

class Assasin extends Character {
    constructor() {
        super('Assasin', [SELL_ACTION], [
            new Item(emoji.MONEY_BAG, 'money')
        ]);
    }
}

class Merchant extends Character {
    constructor() {
        super('Merchant', [SELL_ACTION]);
    }
}

class Rogue extends Character {
    constructor() {
        super('Rogue', [SELL_ACTION]);
    }
}

function oneBasedIndexOrFind(array, indexOrProp, findCallback, onInvalidIdx) {
    if (!isNaN(indexOrProp)) {
        let idx;
        try {
            idx = parseInt(indexOrProp, 10);
        } catch (e) {
            return null;
        }
        if (idx > 0 && idx <= array.length) {
            return array[idx - 1];
        } else {
            onInvalidIdx();
            return null;
        }
    } else {
        return array.find(findCallback);
    }
}

module.exports = {
    GameController
};
