const axios = require('axios');
const {MessageEmbed} = require('discord.js');

const DIFFICULTY = {
    "easy": "\ud83d\ude0c",
    "medium": "\ud83e\udd14",
    "hard": "\ud83e\udd2f"
};

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
                const response = await axios.get("https://opentdb.com/api.php?amount=1");
                const answer = response.data.results[0];
                console.log(JSON.stringify(answer));
                const answers = answer.incorrect_answers.slice(0);
                answers.splice(Math.round(Math.random() * answers.length), 0, answer.correct_answer);
                const embed = new MessageEmbed()
                    .setTitle(DIFFICULTY[answer.difficulty] + ' ' + answer.category)
                    .setColor(0xff7700)
                    .setDescription(answer.question + "\n" + answers.join("\n"));
                message.channel.send(embed).then();
            } catch (err) {
                console.error(err);
                message.reply('lo siento, no he podido obtener una pregunta.')
            }
        }
    }]
}
