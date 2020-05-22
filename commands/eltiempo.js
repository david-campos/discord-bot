const moment = require('moment');
const { MessageEmbed } = require('discord.js');

module.exports = {commands: [{
	name: 'eltiempo',
	shortDescription: 'El tiempo',
	/**
	 * @param {module:"discord.js".Message} message
	 * @param {string[]} args
	 * @param {Bot} context
	 */
	execute(message, args, context) {
		const loc = args && typeof args[0] === "string" ? args[0] : moment.locale();
		const embed = new MessageEmbed()
			.setTitle('Aquest és **EL TEMPS**:')
			.setColor(Math.random() * 0xffffff)
			.setDescription(moment().locale(loc).format('LLLL'));
		message.channel.send(embed).then();
	}
}]};
