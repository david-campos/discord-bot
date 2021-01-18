const {MessageEmbed} = require('discord.js');
const {ChannelStateManager, BaseChannelState} = require("../main/channel_state");
const emoji = require('../emojis2');
const {apelativoRandom} = require("../main/apelativos");

const LETTERS_PREF = 'regional_indicator_';
const LETTERS = 'abcdefgh';
const NUMBERS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];

const stateManager = new ChannelStateManager(
    (channel, bot, key) => new DamasGame(key, channel, bot)
);

class DamasGame extends BaseChannelState {
    constructor(key, channel, bot) {
        super(channel, bot, key);
        this.players = [];
        this.hasStarted = false;
        this.board = []
        this.turn = 0;

        this.checkers = [8, 8];

        for (let i = 0; i < 8; ++i) {
            const line = [];
            for (let j = 0; j < 4; ++j) {
                if (i < 2) line.push(1);
                else if (i > 5) line.push(2);
                else line.push(0);
            }
            this.board.push(line);
        }
    }

    isValidTile(i, j) {
        return i < 8 && j < 8 && (i % 2 === j % 2);
    }

    toBoard(i, j) {
        return [i, Math.floor(j / 2)];
    }

    getTile(i, j) {
        const coords = this.toBoard(i, j);
        return this.board[coords[0]][coords[1]];
    }

    setTile(i, j , val) {
        const coords = this.toBoard(i, j);
        this.board[coords[0]][coords[1]] = val;
    }

    move([fromI, fromJ], [toI, toJ]) {
        this.setTile(toI, toJ, this.getTile(fromI, fromJ));
        this.setTile(fromI, fromJ, 0);
    }

    tryUpgrade([i, j]) {
        const tile = this.getTile(i, j);
        const player = this.getPlayer(tile);
        if (!this.esDama(tile) && ((player === 1 && i === 7) || (player === 2 && i === 0)))
            this.setTile(i, j, tile + 2)
    }

    eat(cells) {
        for (let cell of cells) {
            this.checkers[this.getPlayer(this.board[cell[0]][cell[1]]) - 1]--;
            this.board[cell[0]][cell[1]] = 0;
        }
    }

    getPlayer(tile) {
        if (tile < 3) return tile;
        else return (tile - 1) % 2 + 1;
    }

    esDama(tile) {
        return tile >= 3;
    }

    canMove(player, dama, i, j, i2, j2, eaten) {
        if (i === i2) return false;
        if (player === 0) return false;
        const vi = i2 > i ? 1 : -1;
        // Solo las damas pueden ir hacia atrás
        if (!dama) {
            if (player === 1 && vi === -1) return false;
            if (player === 2 && vi === +1) return false;
        }
        const vj = (i % 2 === 0) ? (j2 >= j ? 1 : -1) : (j2 > j ? 1 : -1);
        let eating = false;
        let nextMustEat = false;
        while (i !== i2) {
            if (i % 2 === 0) j += vj < 0 ? -1 : 0;
            else j += vj < 0 ? 0 : 1;
            i += vi;
            const other = this.getPlayer(this.board[i][j]);
            console.log(i, j, dama, other, nextMustEat, eating);
            if (other === player) return false;
            else if(other === 0) {
                if (!dama && nextMustEat)
                    return false;
                if (!dama && !eating)
                    return i === i2 && j === j2;
                eating = false;
                nextMustEat = true;
            } else if (!eating) {
                eaten.push([i, j]);
                nextMustEat = false;
                eating = true;
            }
            else return false;
        }
        return i === i2 && j === j2;
    }

    boardPrint() {
        let str = emoji.BLACK_LARGE_SQUARE;
        for (let j = 0; j < 8; ++j)
            str += `:${LETTERS_PREF}${LETTERS[j]}:`;
        str += emoji.BLACK_LARGE_SQUARE;
        for (let i = 0; i < 8; ++i) {
            str += `\n:${NUMBERS[i]}:`;
            for (let j = 0; j < 8; ++j) {
                if ((i + j) % 2 === 1) str += emoji.BROWN_SQUARE;
                else {
                    const tile = this.getTile(i, j);
                    const player = this.getPlayer(tile);
                    const dama = this.esDama(tile);
                    if (player === 1) str += dama ? emoji.WHITE_HEART : emoji.WHITE_CIRCLE;
                    else if (player === 2) str += dama ? emoji.BLUE_HEART : emoji.BLUE_CIRCLE;
                    else str += emoji.WHITE_LARGE_SQUARE;
                }
            }
            str += `:${NUMBERS[i]}:`;
        }
        str += "\n" + emoji.BLACK_LARGE_SQUARE;
        for (let j = 0; j < 8; ++j)
            str += `:${LETTERS_PREF}${LETTERS[j]}:`;
        str += emoji.BLACK_LARGE_SQUARE;
        return str;
    }

    /** @param {GuildMember} player */
    addPlayer(player) {
        if (this.players.length < 2 && !this.players.includes(player)) {
            this.players.push(player);
        }
    }

    start() {
        // if (this.players.length < 2) return;
        this.hasStarted = true;
        this.channel.send(this.boardPrint()).then();
        this.lockChannel(this.onMsg.bind(this));
    }

    win(player) {
        const embed = new MessageEmbed();
        embed.setTitle(`${emoji.TROPHY} Ganador: ${this.players[player].displayName}`);
        embed.setDescription(`${this.players[player].displayName} ha ganado.`);
        this.channel.send(embed).then();
        this.finish();
    }

    finish() {
        this.unlockChannel();
    }

    /**
     * @param {string} text
     * @return {[number, number]}
     */
    textToCoord(text) {
        const oneCode ="1".charCodeAt(0);
        const aCode = "A".charCodeAt(0);
        if (/^[1-8][A-H]$/.test(text)) {
            return [text.charCodeAt(0) - oneCode, text.charCodeAt(1) - aCode];
        } else {
            return [text.charCodeAt(1) - oneCode, text.charCodeAt(0) - aCode];
        }
    }

    onMsg(msg, bot) {
        // if (this.players[this.turn].user.id !== msg.author.id)
        if (msg.author.id !== this.players[0].user.id)
            return;
        const moves = msg.content.match(/^([1-8][A-H]|[A-H][1-8])(?:[^0-9A-Z]([1-8][A-H]|[A-H][1-8]))+$/i);
        if (moves) {
            const coords = [];
            for (let i = 1; i < moves.length; ++i) {
                const toCoord = this.textToCoord(moves[i].toUpperCase());
                if (!this.isValidTile(...toCoord)) {
                    console.log("invalid tile", toCoord);
                    msg.react(emoji.NO_ENTRY).then();
                    return;
                }
                coords.push(toCoord);
            }
            if (coords.length < 2) {
                console.log("Not enough coords");
                msg.react(emoji.NO_ENTRY).then();
                return;
            }
            const tile = this.getTile(...coords[0]);
            const player = this.getPlayer(tile);
            const dama = this.esDama(tile);
            /*if (player - 1 !== this.turn) {
                console.log("Not your turn", player, this.turn);
                msg.react(emoji.NO_ENTRY).then();
                return;
            }*/
            const eaten = [];
            let prev = this.toBoard(...coords[0]);
            for (let i = 1; i < coords.length; ++i) {
                const next = this.toBoard(...coords[i]);
                const validMove = this.canMove(player, dama, prev[0], prev[1], next[0], next[1], eaten);
                if (!validMove) {
                    console.log("Invalid move");
                    msg.react(emoji.NO_ENTRY).then();
                    return;
                }
                // TODO: check if player must continue eating!
                prev = next;
            }
            this.move(coords[0], coords[coords.length - 1]);
            this.tryUpgrade(coords[coords.length - 1]);
            this.eat(eaten);
            if (this.checkers[0] === 0) this.win(2);
            else if (this.checkers[1] === 0) this.win(1);
            this.turn = (this.turn + 1) % 2;
            msg.react(emoji.CHECK_MARK_BUTTON).then();
            this.channel.send(this.boardPrint()).then();
        }
    }
}

module.exports = {
    commands: [{
        name: 'damas',
        hidden: true,
        shortDescription: 'Juego de damas',
        description: 'Juego de damas contra otro jugador',
        /**
         * @param {module:"discord.js".Message} message
         * @param {string[]} args
         * @param {Bot} context
         */
        async execute(message, args, context) {
            if (message.channel.type === "dm" || message.channel.type === "news" || message.guild === null) {
                message.reply(`Canal inválido, ${apelativoRandom()}.`);
                return;
            }
            const state = stateManager.getOrGenerateState(message, context);
            if (state.hasStarted) {
                message.reply(`Ya hay un juego en ejecución.`);
                return;
            }
            state.addPlayer(message.member);
            message.react(emoji.THUMBS_UP).then();
            // if (state.players.length === 2)
                state.start();
        }
    }]
}
