// noinspection JSValidateTypes
/** @type {BotConfiguration} */
const config = require('./bot-config.json');

const moment = require('moment');
const {Bot} = require('./main/bot');

// Moment locale configuration
moment.locale(config.locale);
moment.tz.setDefault(config.timezone);

const bot = new Bot(config);
bot.init().then();
