const countries = require('world-countries')
const {RIGHT, WRONG} = require("../guess_quizz/emojis");
const {GuessingController} = require("../guess_quizz/guess_quizz");
const {MessageEmbed} = require('discord.js');
const config = require('../bot-config.json');
const {DEFAULT_SPEEDRUN_LENGTH} = require("../guess_quizz/guess_quizz");


/**
 * @extends GuessingController<Country>
 */
class CapitalController extends GuessingController {
    constructor() {
        super(countries.filter(c => c.capital.length > 0)
                .filter(c => !!c.capital.find(str => str.trim().length > 0)),
            3000,
            10, 300, 500);
    }

    async sendCase(channel, guessCase, description) {
        await super.sendCase(channel, guessCase, description);
    }

    caseToEmbed(guessCase, description) {
        /** @type {Country} */
        const ctr = guessCase.item;
        const ctrName = ctr.name.common;
        return new MessageEmbed()
            .setTitle(`${ctr.flag} What is the capital of ${ctrName}?`)
            .setColor(0xffffff)
            .setDescription(description || `Use \`${config.prefix}capital guess\` to guess.`);
    }

    /**
     * @param message
     * @param {GuessCase<Flag>} guessingCase
     * @param {string} guess
     * @return {module:"discord.js".MessageEmbed}
     */
    embedForRightGuess(message, guessingCase, guess) {
        /** @type {Country} */
        const ctr = guessingCase.item;
        const ctrName = ctr.name.common;
        return new MessageEmbed()
            .setTitle(`${RIGHT} Correct`)
            .setColor(0x00ff00)
            .setDescription(`${guessingCase.solution} is the capital of ${ctrName}
Attempts: ${guessingCase.attempts}
Hints: ${guessingCase.hints}`
            );
    }

    embedForWrongGuess(message, guessingCase, guess, mistakes) {
        /** @type {Country} */
        const ctr = guessingCase.item;
        const ctrName = ctr.name.common;
        return new MessageEmbed()
            .setTitle(`${WRONG} Incorrect!`)
            .setColor(0xff0000)
            .setDescription(`${guess} is not the capital of ${ctrName}\n`
                + `Attempts: ${guessingCase.attempts}\nHints: ${guessingCase.hints}`);
    }

    expertKey(guessCase) {
        /** @type {Country} */
        const ctr = guessCase.item;
        return ctr.name.official;
    }

    /**
     * @param {Country} item
     */
    itemSolution(item) {
        return item.capital.find(str => str.trim().length > 0);
    }

    async saveScore(user, guessCase) {
        // Not done yet
    }
}

const capitalController = new CapitalController();

module.exports = {
    commands: [
        {
            name: 'capital',
            shortDescription: 'Acierta la capital (en inglés)',
            description: 'Gives a random country to guess the capital or guesses the capital for the current country obtained this way',
            usage: [
                {name: 'guess', description: 'capital you guess for the given country', optional: true}
            ],
            execute: capitalController.cmdBasic.bind(capitalController)
        },
        {
            name: 'capital-speed',
            shortDescription: 'Speed-run de capitales (en inglés)',
            description: 'Initiates a capital speedrun. During the speedrun anyone can answer, countries will come one after the other, the first person to answer the correct capital get the point.',
            usage: [
                {name: 'N', description: 'number of countries in the speedrun', optional: true, format: 'positive integer',
                    defaultValue: DEFAULT_SPEEDRUN_LENGTH}
            ],
            execute: capitalController.cmdSpeedRunStart.bind(capitalController)
        },
        {
            name: 'capital-hint',
            shortDescription: 'Pista de capitales (en inglés)',
            description: 'Gives a hint for the current capital guess',
            usage: [],
            execute: capitalController.cmdHint.bind(capitalController)
        },
        {
            name: 'capital-expert',
            shortDescription: 'Expert-run de capitales (en inglés)',
            description: 'Start an expert run, a challenge not made for the faint of heart!',
            usage: [],
            execute: capitalController.cmdExpertRunStart.bind(capitalController)
        },
        {
            name: 'ctr-info',
            description: 'Información sobre un país',
            hidden: true,
            /**
             * @param {module:"discord.js".Message} message
             * @param {string[]} args
             * @param {Bot} context
             */
            execute(message, args, context) {
                if (args.length === 0) {
                    message.reply('no country');
                    return;
                }
                /**
                 * @type {Country|null}
                 */
                let country = null;
                if (args[0].length === 2) {
                    const code = args[0].toUpperCase();
                    country = countries.find(c => c.cca2 === code);
                }
                if (!country && args[0].length === 3) {
                    const code = args[0].toUpperCase();
                    if (/^[0-9]+$/.test(code)) {
                        country = countries.find(c => c.ccn3 === code);
                    } else {
                        country = countries.find(c => c.cca3 === code);
                    }
                }
                if (!country) {
                    const f = x => x.toLowerCase().normalize("NFD").replace(/[^A-Za-z]+/g, '');
                    const normalized = f(args[0]);
                    country = countries.find(c => f(c.name.common) === normalized || f(c.name.official) === normalized)
                        || countries.find(c => c.altSpellings.find(s => f(s) === normalized) !== undefined)
                        || countries.find(c =>
                            Object.values(c.translations).find(
                                t => f(t.official) === normalized || f(t.common) === normalized
                            ) !== undefined
                        );
                }
                if (country === null) {
                    message.reply('country not found');
                    return;
                }
                const embed = new MessageEmbed()
                    .setTitle(country.flag + " " + (country.translations.spa ? country.translations.spa.common : country.name.common))
                    .setColor(0xaaaaaa)
                    .setDescription(`\`\`\`${JSON.stringify(country)}\`\`\``);
                message.channel.send(embed).then();
            }
        }]
};
