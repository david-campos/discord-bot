const { MessageEmbed } = require('discord.js');
const config = require('../bot-config.json');
const {apelativoRandom} = require("../main/apelativos");

const CMD_ACCEPT = "acp";
const CMD_REFFUSE = "rec";
const CMD_INVITE = "inv";
const CMD_PENDENT = "pnd";

const ERR_OCCUPIED = {};

class Game {
   constructor(player1, player2, name1, name2, token0, token1) {
       this.players = [player1, player2];
       this.names = [name1, name2];
       this.turn = 1;
       this.accepted = false;
       this.color = Math.random() * 0xffffff;
       this.board = new Array(3).fill().map(() => new Array(3).fill(null));
       this.tokens = [token0 || "\ud83d\udfe7", token1 || "\ud83d\udfe5"];
   }
   boardToString() {
       return this.board.map((row, i) => row.map((val, j) => val === null ? `${i*3+j+1}\ufe0f\u20e3` : this.tokens[val]).join("")).join("\n");
   }
   printToChannel(channel, extra) {
	let desc = `${this.tokens[0]} ${this.names[0]}\n${this.tokens[1]} ${this.names[1]}\n\n`;
	desc += this.boardToString() + (extra || `\n\nTurno: ${this.names[this.turn]}`);
	const embed = new MessageEmbed()
		.setTitle('3 en Raya')
		.setColor(this.color)
		.setDescription(desc);
	channel.send(embed);
   }
   play(i, j) {
	if (j === undefined) {
		j = ((i - 1) % 3);
		i = Math.floor((i - 1) / 3);
	}
        if (this.board[i][j] !== null) {
		throw ERR_OCCUPIED;
	}
	this.board[i][j] = this.turn;
	this.turn = 1 - this.turn;
   }
   getWinner() {
	const equal = (el0, el1, el2) =>
	   this.board[el0[0]][el0[1]] !== null
	   	&& this.board[el0[0]][el0[1]] === this.board[el1[0]][el1[1]]
		&& this.board[el1[0]][el1[1]] === this.board[el2[0]][el2[1]];
	for (let i = 0; i < 3; i++) {
		if (equal([i, 0], [i, 1], [i, 2])) return this.board[i][0];
		if (equal([0, i], [1, i], [2, i])) return this.board[0][i];
	}
	if (equal([0, 0], [1, 1], [2, 2])) return this.board[0][0];
	if (equal([2, 0], [1, 1], [0, 2])) return this.board[2][0];
	for (let line of this.board) {
		for (let val of line) {
			if (val === null) {
				return undefined;
			}
		}
	}
	return null;
   }
}

const games = new Map();
function isEmoji(str) {
	const ranges = [
	  '\ud83c[\udf00-\udfff]', // U+1F300 to U+1F3FF
	  '\ud83d[\udc00-\ude4f]', // U+1F400 to U+1F64F
	  '\ud83d[\ude80-\udeff]', // U+1F680 to U+1F6FF
	  ' ', // Also allow spaces
	].join('|');
	return !!new RegExp('^(?:'+ranges+')$').test(str);
}
function onMessage(msg) {
	if (msg.author.bot) return;
	if (games.size === 0) return;
	const game = games.get(msg.author.id);
	if (!game || !game.accepted || game.players.indexOf(msg.author.id) !== game.turn) return;
	if (msg.content[0] >= '0' && msg.content[0] <= '9') {
		const match = msg.content.match(/^([0-2])\s*,?\s*([0-2])(?!\d)|^([1-9])/);
		if (match) {
			try {
				if (match[2] !== undefined) {
					game.play(parseInt(match[1], 10), parseInt(match[2], 10));
				} else {
					game.play(parseInt(match[3], 10));
				}
				const winner = game.getWinner();
				if (winner === undefined) {
				    game.printToChannel(msg.channel);
				} else if(winner === null) {
				    game.printToChannel(msg.channel, `\n\nEmpate!`);
				    games.delete(game.players[0]);
				    games.delete(game.players[1]);
				} else {
				    game.printToChannel(msg.channel, `\n\nHa ganado ${game.names[winner]}!`);
				    games.delete(game.players[0]);
				    games.delete(game.players[1]);
				}
			} catch (err) {
				if (err === ERR_OCCUPIED) {
				    msg.reply(`la casilla está ocupada, ${apelativoRandom()}.`);
				}
			}
		}
	}
}

function invite(message, args) {
	if (message.mentions.users.size !== 1) {
		message.reply("debes mencionar a un solo usuario para invitarlo a una partida.");
		return;
	}
	const player0 = message.author.id;
	const player1 = message.mentions.users.first().id;
	if (games.has(player0) || games.has(player1)) {
		message.reply("uno de vosotros ya tiene un juego en proceso o una invitación pendiente.");
		return;
	}
	const game = new Game(player0, player1, message.member.displayName, message.mentions.members.first().displayName, isEmoji(args[1]) ? args[1] : undefined);
	games.set(player0, game);
	games.set(player1, game);
	message.channel.send(`${message.member.displayName} te ha retado al 3 en raya, <@${player1}>! `
		+ `Introduce \`${config.prefix}3r ${CMD_ACCEPT}\` para aceptar o \`${config.prefix}3r ${CMD_REFFUSE}\` para rechazar.`);
}

function accept(message, args) {
	const game = games.get(message.author.id);
	if (!game) {
		message.reply(`no estás invitado a ninguna partida, ${apelativoRandom()}.`);
		return;
	}
	if (game.players[1] !== message.author.id) {
		message.reply(`estás esperando que ${game.names[1]} acepte. Puedes cancelar la invitación con \`${config.prefix}3r ${CMD_REFFUSE}\`.`);
		return;
	}
	game.accepted = true;
	if (args[1] && isEmoji(args[1])) {
		game.tokens[1] = args[1];
	}
	game.printToChannel(message.channel);
}

function cancel(message) {
	const game = games.get(message.author.id);
	if (!game) {
		message.reply(`no tienes invitaciones salientes ni entrantes que cancelar, ${apelativoRandom()}.`);
		return;
	}
	games.delete(game.players[0]);
	games.delete(game.players[1]);
	message.channel.send(`Partida de 3 en raya ${game.names[0]} vs ${game.names[1]} cancelada.`);
}

function pendent(message) {
	const id = message.author.id;
	const game = games.get(id);
	if (!game) {
		message.reply(`no tienes invitaciones salientes ni entrantes, ${apelativoRandom()}.`);
		return;
	}
	message.reply(`tienes una partida ${game.players[0] === id ? 'saliente' : 'entrante'} ${game.accepted ? 'en curso' : 'pendiente de aceptación'}.`);
}

module.exports = {
	hooks: {'message': onMessage},
	commands: [
	{
		name: '3r',
		shortDescription: '3 en raya',
		execute(message, args, context) {
			if (!message.author) return;
			const lowArgs = args.map(arg => arg.toLowerCase());
			const fns = {
				[CMD_PENDENT]: pendent,
				[CMD_ACCEPT]: accept,
				[CMD_REFFUSE]: cancel,
				[CMD_INVITE]: invite
			};
			if (args.length < 1 || !(lowArgs[0] in fns)) {
				message.reply(`introduce \`${config.prefix}3r ${CMD_INVITE}\` mencionando a un usuario para invitarlo a una partida.`);
			} else {
				fns[lowArgs[0]](message, args);
			}
		}
	}

]};

