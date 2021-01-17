const {BaseChannelState} = require("../main/channel_state");
const {ChannelStateManager} = require("../main/channel_state");
const {MessageEmbed, GuildMember, User} = require('discord.js');
const fs = require('fs');
const emoji = require("../emojis2");
const {Logger} = require("../logging/logger");
const {popRandomElement, pickRandomElement} = require("../generic/array");
const {apelativoRandom} = require("../main/apelativos");
const path = require('path');
const {pickRandomIdx} = require("../generic/array");
const {capitalize} = require("../generic/text");

const logger = new Logger(path.basename(__filename, '.js'));

const MIN_PLAYERS = 2;
const WEAPONS_PER_PLAYER = 3;
const ROUNDS_PER_DEATH = 2;

const WEAPONS = [
    [emoji.PISTOL, 'a', 'gun'],
    [emoji.LIPSTICK, '', 'lipstick'],
    [':thong_sandal:', 'a', 'sandal'],
    [emoji.MECHANICAL_ARM, 'a', 'mechanical arm'],
    [emoji.MECHANICAL_LEG, 'a', 'mechanical leg'],
    [emoji.SCARF, 'a', 'scarf'],
    [emoji.UMBRELLA, 'an', 'umbrella'],
    [emoji.CACTUS, 'a', 'cactus'],
    [emoji.MUSHROOM, '', 'mushrooms'],
    [emoji.SPOON, 'a', 'spoon'],
    [emoji.CHOPSTICKS, '', 'chopsticks'],
    [emoji.BROCCOLI, '', 'broccoli'],
    [emoji.CUCUMBER, 'a', 'cucumber'],
    [emoji.WINE_GLASS, '', 'wine'],
    [emoji.WRENCH, 'a', 'wrench'],
    [emoji.HAMMER, 'a', 'hammer'],
    [emoji.PICK, 'a', 'pickaxe'],
    [emoji.AXE, 'an', 'axe'],
    [emoji._CARPENTRY_SAW, 'a', 'saw'],
    [emoji.KITCHEN_KNIFE, 'a', 'knife'],
    [emoji.DAGGER, 'a', 'dagger'],
    [emoji.SCISSORS, 'two', 'scissors'],
    [':plunger:', 'a', 'plunger'],
    [emoji.TEST_TUBE, 'a', 'test tube'],
    [emoji.ROLLEDUP_NEWSPAPER, 'a', 'rolledup newspaper']
];

const WEAPONS_EMOJIS = WEAPONS.map(w => w[0]);

const WAYS = [
    'shooted',
    'poisoned',
    'hit to death',
    'strangled',
    'rubbed',
    'penetrated',
    'stabbed in the back',
    'stabbed in the eyes',
    'stabbed in the neck',
    'cut by the neck',
    'chopped into pieces'
];

const ROOMS = [
    [emoji.TOILET, 'toilet'],
    [emoji.BED, 'bedroom'],
    [emoji.HOUSE_WITH_GARDEN, 'garden'],
    [emoji.COOKING, 'kitchen'],
    [emoji.COUCH_AND_LAMP, 'living room']
];
const ROOMS_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const ROOM_EMOJIS = ROOMS.map(w => w[0]);

const VICTIMS = [
    'the waiter',
    'the butler',
    'the daughter',
    'the son',
    'the lord',
    'the madame',
    'the dog'
];

class GameController {
    constructor() {
        /** @type {ChannelStateManager<GameInstance>} */
        this.stateManager = new ChannelStateManager(
            (channel, bot, key) => new GameInstance(key, channel, bot, this)
        );

        this.cmdStartGame = this._requiresGameCreated.bind(this, this.cmdStartGame.bind(this));
        this.cmdJoinGame = this._requiresGameCreated.bind(this, this.cmdJoinGame.bind(this));
        this.cmdLeaveGame = this._requiresGameCreated.bind(this, this.cmdLeaveGame.bind(this));
        this.cmdCancelGame = this._requiresGameCreated.bind(this, this.cmdCancelGame.bind(this));
    }

    /**
     * @param {string} cmd commandName
     * @param {[string, string, string, string]} subcommandNames - [join, leave, start, cancel]
     * @param {module:"discord.js".Message} message
     * @param {string[]} args
     * @param {Bot} context
     */
    async cmdNewGame(cmd, [join, leave, start, cancel], message, args, context) {
        if (['dm', 'unknown'].includes(message.channel.type)) {
            message.reply(`Invalid channel, ${apelativoRandom()}.`);
            return;
        }
        const game = this.stateManager.getOrGenerateState(message, context);
        if (game.author) {
            await message.channel.send('Game already created.');
        } else {
            game.setAuthor(message.member);
            const pref = context.config.prefix;
            await message.channel.send(`New game of **Killer** created by ${game.author.name}.
Use \`${pref}${cmd} ${join}\` to join the game. If you wish to leave the game use \`${pref}${cmd} ${leave}\`.
The game will start when ${game.author.name} introduces \`${pref}${cmd} ${start}\`.
${game.author.name} can cancel the game introducing \`${pref}${cmd} ${cancel}\``);
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
            game.join(message.member);
            await message.react(emoji.OK_BUTTON);
        } catch (e) {
            await this._replyOrThrow({
                'started': 'the game has already started.',
                'already-in': `you have already joined, ${apelativoRandom()}.`,
                'too-many-players': `there are already too many players.`
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
            game.leave(message.member);
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
     * @param {Message} message
     * @param {string[]} args
     * @param {Bot} context
     */
    async cmdCancelGame(message, args, context) {
        /** @type {GameInstance} */
        const game = this.stateManager.getOrGenerateState(message, context);
        if (game.author.is(message.author)) {
            game.finish();
        }
    }

    /**
     * @param {module:"discord.js".Message} message
     * @param {string[]} args
     * @param {Bot} context
     */
    async cmdStartGame(message, args, context) {
        const game = this.stateManager.getOrGenerateState(message, context);
        if (game.author.is(message.author)) {
            try {
                await game.start();
            } catch (e) {
                await this._replyOrThrow({
                    'not-enough-players': `the number of players is not enough (${game.players.length}/${MIN_PLAYERS})!`,
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

class Player {
    /**
     * @param {module:"discord.js".GuildMember} member
     */
    constructor(member) {
        /** @type {string} */
        this.id = member.user.id;
        /** @type {string} */
        this.name = member.displayName;
        /** @type {DMChannel} */
        this.channel = null;
        this.member = member;
        this.weapons = [];
        this.room = null;
    }

    async createDmChannel() {
        this.channel = await this.member.user.createDM();
    }

    /**
     * @param {GuildMember|module:"discord.js".User|Player} memberUserOrPlayer
     */
    is(memberUserOrPlayer) {
        if (memberUserOrPlayer instanceof GuildMember) {
            memberUserOrPlayer = memberUserOrPlayer.user; // get user
        }
        return this.id === memberUserOrPlayer.id;
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
        this.turn = 0;
        this.totalTurns = 0;
        /** @type {Player} */
        this.author = null;
        this.players = {};
        this.playersNum = 0;
        this.clueFoundMessage = null;
        /** @type {Player} */
        this.murderer = null;
        this.murderWay = pickRandomElement(WAYS);
        this.victim = pickRandomElement(VICTIMS);
        this.usedWeapon = Math.round(Math.random() * (WEAPONS_PER_PLAYER - 1));
    }

    /**
     * @param {module:"discord.js".GuildMember} author
     */
    setAuthor(author) {
        if (this.author !== null) return;
        this.author = new Player(author);
    }

    /**
     * @return {Player[]}
     * @private
     */
    _getPlayers() {
        return Object.values(this.players);
    }

    _addPlayer(player) {
        if (player.id in this.players)
            return;
        this.players[player.id] = player;
        this.playersNum++;
    }

    _removePlayer(id) {
        if (id in this.players) {
            delete this.players[id];
            this.playersNum--;
        }
    }

    /**
     * @param {module:"discord.js".GuildMember} member
     */
    join(member) {
        if (this.started) throw 'started';
        if (!!this.players[member.user.id]) throw 'already-in';
        const maxPlayers = Math.min(ROOMS.length, Math.floor(WEAPONS.length / WEAPONS_PER_PLAYER));
        if (this.playersNum > maxPlayers) throw 'too-many-players';
        this._addPlayer(new Player(member));
    }

    /**
     * @param {module:"discord.js".GuildMember} member
     */
    leave(member) {
        if (this.started) throw 'started';
        if (this.author.is(member)) throw 'author';
        this.players._removePlayer(member.user.id);
    }

    async start() {
        if (this.playersNum < MIN_PLAYERS) throw 'not-enough-players';
        const roomsCpy = ROOMS.slice();
        const weaponsCpy = WEAPONS.slice();
        for (const p of this._getPlayers()) {
            for (let i = 0; i < WEAPONS_PER_PLAYER; i++)
                p.weapons.push(popRandomElement(weaponsCpy));
            p.room = popRandomElement(roomsCpy);
        }
        this.murderer = pickRandomElement(this._getPlayers());
        this.started = true;
        // Wait for all the players to have a dm channel
        await Promise.all([
            this.author.createDmChannel(),
            this.murderer.createDmChannel()
        ]);
        await this.murderer.channel.send(this._murderedStr(
            'you', this.victim, this.murderer.weapons[this.usedWeapon],
            this.murderWay, this.murderer.room
        ));
        await this.author.channel.send(this._genAuthorInstructions());
        this.lockChannel(this._onMsg.bind(this));
        await new Promise(res => setTimeout(res, 5000));
        await this._sendInitialReport(true);
        await this._sendTurn();
    }

    /**
     * @param {Message} msg
     * @param {Bot} bot
     * @private
     */
    async _onMsg(msg, bot) {
        if (msg.author.bot)
            return;
        const authorPlayer = this._getPlayers().find(p => p.is(msg.author));
        if (!authorPlayer)
            return;
        if (msg.content.trim().toLowerCase() === "report") {
            this._sendInitialReport(false).then();
            return;
        }
        if (this.murderer.is(msg.author))
            return;
        if (msg.mentions.users.size !== 1)
            return;
        const accused = msg.mentions.users.first();
        const accusedP = this._getPlayers().find(p => p.is(accused));
        if (!accusedP)
            return;
        let room = ROOM_EMOJIS.find(em => msg.content.indexOf(em) >= 0);
        let weapon = WEAPONS_EMOJIS.find(em => msg.content.indexOf(em) >= 0);
        if (!weapon) {
            const match = msg.content.match(/\b[1-9][0-9]?\b/);
            if (match) {
                const idx = parseInt(match[0]);
                if (idx > 0 && idx <= WEAPONS_PER_PLAYER)
                    weapon = accusedP.weapons[idx - 1][0];
            }
        }
        if (!room) {
            const match = msg.content.match(/\b[A-Z]\b/i);
            if (match) {
                const idx = ROOMS_LETTERS.indexOf(match[0].toUpperCase());
                if (idx >= 0 && idx < ROOMS.length)
                    room = ROOMS[idx][0];
            }
        }
        if (!room || !weapon) {
            msg.react(emoji.QUESTION_MARK).then();
            return;
        }
        if (this.murderer.is(accused)
            && this.murderer.room[0] === room
            && this.murderer.weapons[this.usedWeapon][0] === weapon) {
            msg.react(emoji.THUMBS_UP).then();
            await this._win(authorPlayer);
        } else {
            msg.react(emoji.THUMBS_DOWN).then();
            await this._lose(authorPlayer);
        }
    }

    async _passTurn() {
        if (!this.started)
            return;
        this.totalTurns += 1;
        if (this.totalTurns !== 0 && this.totalTurns  % (ROUNDS_PER_DEATH * this.playersNum) === 0) {
            await this._killOne();
        }
        if (!this.started)
            return;
        this.turn = this.totalTurns % this.playersNum;
        await this._sendTurn();
    }

    async _killOne() {
        const players = this._getPlayers();
        let killedIdx = pickRandomIdx(players);
        while (players[killedIdx].is(this.murderer)) {
            killedIdx++;
        }
        const killed = players[killedIdx];

        // Not playing anymore!
        this._removePlayer(killed.id);

        await this._sendHasDied(killed);
        if (this.playersNum < 2) {
            await this._win(this.murderer);
        }
    }

    /**
     * @param {Player} winner
     * @private
     */
    async _win(winner) {
        const embed = new MessageEmbed();
        embed.setTitle(`${emoji.TROPHY} ${winner.name} has won!`);
        embed.setDescription(this._murderedStr(
            this.murderer.name, this.victim,
            this.murderer.weapons[this.usedWeapon],
            this.murderWay, this.murderer.room));
        await this.channel.send(embed);
        this.finish();
    }

    async _lose(loser) {
        const wasInTurn = this._getPlayers()[this.turn].is(loser);

        this._removePlayer(loser.id);

        const embed = new MessageEmbed();
        embed.setTitle(`${emoji.CRYING_FACE} ${loser.name} has lost!`);
        embed.setDescription(`His accusation was wrong, sadly.`);

        this.channel.send(embed).then();

        if (this.playersNum < 2) {
            await this._win(this.murderer);
        } else if (wasInTurn) {
            await this._sendTurn();
        }
    }

    /**
     * @param {Player} player
     * @private
     */
    async _sendHasDied(player) {
        const embed = new MessageEmbed();
        embed.setTitle(`${emoji.SKULL_AND_CROSSBONES} ${capitalize(player.name)} has been brutally murdered!`);
        embed.setDescription(`There is blood and guts everywhere. You are now ${this.playersNum} players.`);
        await this.channel.send(embed);
    }

    async _sendTurn() {
        const next = this._getPlayers()[this.turn];
        const found = Math.random() > 0.5;
        const msgText =
            `Turn: ${next.name}\n` +
            (found ?
                `${emoji.OK_BUTTON} If the clue is possible, it was **found**.` :
                `${emoji.PROHIBITED} If the clue is possible, it was **not found**.`);
        if (this.clueFoundMessage === null) {
            this.clueFoundMessage = await this.author.channel.send(msgText);
            await this.clueFoundMessage.react(emoji.CROSS_MARK);
        } else {
            await this.clueFoundMessage.edit(msgText);
        }
        const msg = await this.channel.send(new MessageEmbed({
            'title': `${emoji.NEXT_TRACK_BUTTON} New turn`,
            'description': `*${next.name}* has now the turn.`
        }));
        await msg.react(emoji.OK_BUTTON);
        const filter = (reaction, user) => reaction.emoji.name === emoji.OK_BUTTON && next.is(user);
        const filterFinish = (reaction, user) => reaction.emoji.name === emoji.CROSS_MARK && this.author.is(user);
        setTimeout(async () => {
            let stop = false;
            while (this.started && !stop) {
                await Promise.all([
                    msg.awaitReactions(filter, {time: 1000})
                        .then(collected => collected.size > 0 && (stop = true) && this._passTurn()),
                    this.clueFoundMessage.awaitReactions(filterFinish, {time: 1000})
                        .then(collected => collected.size > 0 && (stop = true) && this.finish())
                ]);
            }
            logger.log("Turn loop ended");
        });
    }

    _genAuthorInstructions() {
        const embed = new MessageEmbed();
        embed.setTitle(`${emoji.POLICE_CAR_LIGHT} You are the police`);
        embed.setDescription('If some suspect asks for clues which do not make sense for the crime, answer negatively. If the clue makes sense given the actual crime situation, you will answer negatively or positively depending on whether the clue could be found (I will send it to you each turn).');
        embed.addField(`${emoji.WHITE_QUESTION_MARK} Example`,
            'If the victim was stabbed in the eye with a knife in the kitchen and someone asks *"did you find rests of food in the body?"*, then send me a message to know whether the clue was found or not (any message will work).\n'
            + '- If the clue was **found** you could say something like: *"Indeed, I found rests of food in the clothes!"*.\n'
            + '- If the clue was **not found** you could say something like: *"No, there were no rests of food."*.\n'
            + 'If the suspect asked, instead, *"does the victim present signs of suffocation?"*, you should directly answer *no*.\n'
            + 'Remember that you can also answer *"I am a bit unsure"* or similar answers when in doubt.');
        embed.addField(`${emoji.SKULL} The crime`, this._murderedStr(
            this.murderer.name, this.victim, this.murderer.weapons[this.usedWeapon],
            this.murderWay, this.murderer.room)
        );
        embed.addField(`${emoji.HOUSE} The rooms`, this._locationsStr());
        return embed;
    }

    _locationsStr() {
        return this._getPlayers()
            .filter(p => !p.is(this.murderer))
            .map(p => `${p.room[0]} ${p.name} was in the ${p.room[1]}`).join("\n");
    }

    async _sendInitialReport(isFirst) {
        if (!this.started)
            return;
        const names = this._getPlayers().map(p => p.name);
        const players = `${names.slice(0, names.length - 1).join(',')} or ${names[names.length - 1]}`;
        const items = this._getPlayers().map(p => `- **${p.name}**:\n${p.weapons.map((w, i) => `-- ${i + 1} ${w.join(' ')}`).join(',\n')}`).join('\n');
        const embed = new MessageEmbed();
        embed.setTitle(`${emoji.SKULL_AND_CROSSBONES} There has been **a murder**!`);
        embed.setColor(0xff0000);
        embed.setDescription(`${capitalize(this.victim)} has appeared death! The murderer is one of you: ${players}.`);
        if (isFirst)
            embed.addField(`${emoji.POLICE_OFFICER} The policeman`,
                `${this.author.name} is the policeman with access to the clues but, what a shame! He is too stupid to be able to investigate at all. So you will need to try to solve this yourselves.`
            );
        embed.addField(`${emoji.PAGE_FACING_UP} Initial report`, `The suspects were carring some suspicious items, enumerated here:\n${items}`);
        embed.addField(`${emoji.HOUSE} Rooms`,`The house has the following rooms:\n${ROOMS.map((r, i) => `- ${ROOMS_LETTERS[i]} ${r[0]} ${capitalize(r[1])}`).join("\n")}`);
        // TODO: add info about turns and so
        embed.setTimestamp(new Date());
        await this.channel.send(embed);
    }

    /**
     * Constructs the sentence of killing someone
     * @param {string} murderer
     * @param {string} victim
     * @param {[string, string, string]} weapon
     * @param {string} way
     * @param {[string, string]} room
     * @private
     */
    _murderedStr(murderer, victim, weapon, way, room) {
        const article = weapon[1] !== '' ? weapon[1] + ' ' : '';
        return `${capitalize(victim)} was ${way} with ${article}${weapon[2]} ${weapon[0]} by **${murderer}** in the ${room[1]} ${room[0]}.`;
    }

    finish() {
        this.started = false;
        this.unlockChannel();
        this.controller.removeGame(this.key);
        this.channel.send("Game stopped").then();
    }
}

module.exports = {
    GameController
};
