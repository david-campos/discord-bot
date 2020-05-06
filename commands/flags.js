<<<<<<< HEAD
import {MessageEmbed} from "discord.js";

=======
const {MessageEmbed} = require("discord.js");
>>>>>>> 458b5b98d3fbe3a5d68eeb23b6986b5c20a0b0e6
const config = require('../bot-config.json');
const flags = require('../assets/flag-emojis.json');
const levenshtein = require('js-levenshtein');

const WRONG = '\u274c'
const RIGHT = '\u2705'

let currentFlag = null;
let attempts = 0;

function normalize(str) {
    return str.toLowerCase().trim()
        .normalize("NFD")
        .replace(/[^A-Za-z0-9\s\-]+/g, "")
        .replace(/(\s|-)+/g, " ");
}

module.exports = [
    {
        name: 'rflag',
        description: 'Gives a random flag to guess the country',
        execute(message, args, context) {
            if (currentFlag == null) {
                let flag;
                do {
                    flag = flags[Math.floor(Math.random() * flags.length)];
                } while (!flag.emoji);
                currentFlag = flag;
            }
            attempts = 0;
            const embed = new MessageEmbed()
                .setTitle('What is the name of this country?')
                .setColor(Math.random() * 0xffffff)
                .setDescription(currentFlag.emoji +  `\n\nUse \`${config.prefix}gflag country\` to guess.`);
            message.channel.send(embed);
        }
    },
    {
        name: 'gflag',
        description: 'Guesses a country for a flag',
        execute(message, args, context) {
            if (args.length === 0) {
                message.reply("Empty string? Really? You tard.");
                return;
            }
            const guess = normalize(args.join(" "))
            const right = normalize(currentFlag.name);
            const guessedWords = guess.split(" ");
            const rightWords = right.split(" ");
            const score = guessedWords.reduce((p, gw) =>
                p + Math.min(...rightWords.map(rw => levenshtein(gw, rw))),
                0
            ) / guessedWords.length;
            attempts += 1;
            const accepted = score > 0.9;
            const afterText = accepted ?
                `is the flag of ${currentFlag.name}.` :
                `is not the flag of ${args.join(" ")}.`
            const embed = new MessageEmbed()
                .setTitle(`${accepted ? `${RIGHT} Correct` : `${WRONG} Wrong`}!`)
                .setColor(Math.random() * 0xffffff)
                .setDescription(`${currentFlag.emoji} ${afterText}\nScore: ${score}\nAttempts: ${attempts}`);
            message.channel.send(embed);
        }
    }
];
