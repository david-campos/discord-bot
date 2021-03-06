const capital = require('world-countries')
const {RIGHT, WRONG} = require("../guess_quizz/emojis");
const {GuessingController} = require("../guess_quizz/guess_quizz");
const {MessageEmbed} = require('discord.js');
const config = require('../bot-config.json');
const {DEFAULT_SPEEDRUN_LENGTH} = require("../guess_quizz/guess_quizz");

/**
 * @extends GuessingController<Country>
 */
class CapitalController extends GuessingController {
    constructor(countriesList) {
        super(countriesList.filter(c => c.capital.length > 0)
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
            .setDescription(
                (guessingCase.solution.length > 1 ?
                    `${
                        guessingCase.solution.slice(0, guessingCase.solution.length - 1).join(', ')
                    } and ${
                        guessingCase.solution[guessingCase.solution.length - 1]
                    } are the capitals of ${ctrName}`
                    : `${guessingCase.solution[0]} is the capital of ${ctrName}.`)
                + `\nAttempts: ${guessingCase.attempts}\nHints: ${guessingCase.hints}`
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
        return item.capital.filter(str => str.trim().length > 0);
    }

    async saveScore(user, guessCase) {
        // Not done yet
    }
}

const capitalController = new CapitalController(capital);
const tempRegions = new Set();
const subregions = new Map();
capital.forEach(ctr => {
    tempRegions.add(ctr.region);
    if (ctr.subregion.length > 0) {
        if (subregions.has(ctr.region)) {
            subregions.get(ctr.region).add(ctr.subregion);
        } else {
            subregions.set(ctr.region, new Set([ctr.subregion]));
        }
    }
});
const regions = new Array(...tempRegions);

const SUBCOMMANDS = {
    'speed': async (msg, args, bot) => {
        const independent = args.length > 0 && args[0] === "independent";
        if (independent) {
            args = args.slice(1);
        }
        const hasRegion = args.length > 0 && isNaN(parseInt(args[0], 10));
        if (!independent && !hasRegion) {
            await capitalController.cmdSpeedRunStart(msg, args, bot);
        } else {
            const lastIsNumber = args.length > 0 && !isNaN(parseInt(args[args.length - 1], 10));
            const newArgs = lastIsNumber ? args.slice(args.length - 1) : [];
            const filtroIdp = independent ? (ctr => ctr.independent) : (() => true);
            if (hasRegion) {
                const region = args.slice(0, lastIsNumber ? args.length - 1 : args.length).join(' ');
                const filtroRegion = ctr => ctr.region === region || ctr.subregion === region;
                await capitalController.cmdSpeedRunStart(msg, newArgs, bot,
                    ctr => filtroRegion(ctr) && filtroIdp(ctr));
            } else {
                await capitalController.cmdSpeedRunStart(msg, newArgs, bot, ctr => ctr.independent);
            }
        }
    },
    'regions': async (msg, args, bot) => {
        msg.reply(
            'Regions (with subregions between parenthesis):\n'
            + regions.map(rg => subregions.has(rg) ?
            `${rg}: ${[...subregions.get(rg)].join(', ')}` : rg).join('\n')
        );
    },
    'hint': capitalController.cmdHint.bind(capitalController),
    'expert': capitalController.cmdExpertRunStart.bind(capitalController)
};

/**
 * @type {CommandExports}
 */
module.exports = {
    commands: [
        {
            name: 'capital',
            shortDescription: 'Acierta la capital (en inglés)',
            description: 'Gives a random country to guess the capital or guesses the capital for the current country obtained this way',
            usage: [
                {
                    subcommand: 'Basic', description: 'Gives a capital to guess and allows to guess it',
                    args: [{name: 'guess', description: 'capital you guess for the given country', optional: true}]
                },
                {
                    subcommand: 'Hint',
                    description: 'Gives a hint for the current capital guess',
                    args: [{name: 'hint', isLiteral: true}]
                },
                {
                    subcommand: 'Capital speed',
                    description: 'Initiates a capital speedrun. During the speedrun anyone can answer, countries will come one after the other, the first person to answer the correct capital get the point.',
                    args: [
                        {
                            name: 'speed',
                            isLiteral: true
                        },
                        {
                            name: 'independent',
                            description: 'only independent countries capitals',
                            optional: true,
                            isLiteral: true
                        },
                        {
                            name: 'region',
                            description: 'region or sub-region, check regions with -capital-regions',
                            optional: true,
                            format: 'check -capital-regions for valid values',
                            defaultValue: 'null'
                        },
                        {
                            name: 'N',
                            description: 'number of countries in the speedrun',
                            optional: true,
                            format: 'positive integer',
                            defaultValue: DEFAULT_SPEEDRUN_LENGTH
                        }
                    ]
                },
                {
                    subcommand: 'Regions',
                    description: 'Lists the possible regions and subregions to filter the capitals when starting a speedrun.',
                    args: [{name: 'regions', isLiteral: true}]
                },
                {
                    subcommand: 'Expert',
                    description: 'Start an expert run, a challenge not made for the faint of heart!',
                    args: [{name: 'expert', isLiteral: true}]
                }
            ],
            execute: async (msg, args, bot) => {
                if (args.length > 0 && (args[0] in SUBCOMMANDS)) {
                    SUBCOMMANDS[args[0]](msg, args.slice(1), bot);
                } else {
                    capitalController.cmdBasic(msg, args, bot);
                }
            }
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
                    country = capital.find(c => c.cca2 === code);
                }
                if (!country && args[0].length === 3) {
                    const code = args[0].toUpperCase();
                    if (/^[0-9]+$/.test(code)) {
                        country = capital.find(c => c.ccn3 === code);
                    } else {
                        country = capital.find(c => c.cca3 === code);
                    }
                }
                if (!country) {
                    const f = x => x.toLowerCase().normalize("NFD").replace(/[^A-Za-z]+/g, '');
                    const normalized = f(args[0]);
                    country = capital.find(c => f(c.name.common) === normalized || f(c.name.official) === normalized)
                        || capital.find(c => c.altSpellings.find(s => f(s) === normalized) !== undefined)
                        || capital.find(c =>
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
