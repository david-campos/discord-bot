const axios = require('axios');
const {MessageEmbed} = require('discord.js');

const DIFFICULTY_EMOJI = {
    "easy": "\ud83d\ude0c",
    "medium": "\ud83e\udd14",
    "hard": "\ud83e\udd2f"
};

const DIFFICULTY_COLORS = {
    "easy": 0x00ff00,
    "medium": 0xffff00,
    "hard": 0xff0000
};

function decodeBase64(text) {
    let buff = Buffer.from(text, 'base64');
    return buff.toString('utf8');
}

module.exports = {
    commands: [{
        name: 'trivia',
        description: 'Trivia questions (en inglés, cortesía de opentdb.com)',
        /**
         * @param {module:"discord.js".Message} message
         * @param {string[]} args
         * @param {Bot} context
         */
        async execute(message, args, context) {
            try {
                const response = await axios.get("https://opentdb.com/api.php?amount=1&encode=base64");
                const answer = response.data.results[0];
                const difficulty = decodeBase64(answer.difficulty);
                let answers = answer.incorrect_answers.slice(0);
                answers.splice(Math.round(Math.random() * answers.length), 0, answer.correct_answer);
                answers = answers.map((ans, index) =>
                    "\ud83c" + String.fromCharCode("\udde6".charCodeAt(0) + index) + "  " + decodeBase64(ans));
                console.log(decodeBase64(answer.correct_answer));
                const embed = new MessageEmbed()
                    .setTitle(DIFFICULTY_EMOJI[difficulty] + ' ' + decodeBase64(answer.category))
                    .setColor(DIFFICULTY_COLORS[difficulty])
                    .setDescription(decodeBase64(answer.question) + "\n" + answers.join("\n"));
                message.channel.send(embed).then();
            } catch (err) {
                console.error(err);
                message.reply('lo siento, no he podido obtener una pregunta.')
            }
        }
    }]
}
