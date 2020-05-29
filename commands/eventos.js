const Sequelize = require("sequelize");
const path = require('path');

const moment = require('moment');
const {OK, WASTE_BASKET} = require("../guess_quizz/emojis");
const {MessageEmbed} = require('discord.js');

const LOG_TAG = path.basename(__filename);

/**
 * Saves the events so they will not be lost if there is a crash or whatever
 */
class Event extends Sequelize.Model {
}

const TIMESTAMP_FORMAT = 'YYYY-MM-DDTHH:mm:ssZ';
const TIMESTAMP_INPUT = [
    'DD/MM/YYYY HH:mm', 'DD/MM/YYYY H:m',
    'DD/MM/YY HH:mm', 'DD/MM/YY H:m',
    'D/M/YY HH:mm', 'D/M/YY H:m',
    'D/M HH:mm', 'D/M H:m'
];
const TIMESTAMP_INPUT_ONLY_TIME = ['HH:mm', 'HH'];
const SPECIAL_TIMESTAMP_INPUTS = new Map([
    ['manana', () => moment().add(1, 'days')],
    ['pasado', () => moment().add(2, 'days')]
]);
const TIMESTAMP_OUTPUT = TIMESTAMP_INPUT[0];

/**
 * @type {{crear: ExecuteCallback, mostrar: ExecuteCallback, borrar: ExecuteCallback}}
 */
const SUBCOMMANDS = {
    crear: async (message, args, context) => {
        const event = {
            channel_id: message.channel.id,
            creator: message.author.id
        };
        const groupedArgs = {};
        let currentKey = null;
        for (const arg of args) {
            if (arg.startsWith('-')) {
                if (currentKey) groupedArgs[currentKey] = groupedArgs[currentKey].join(' ').trim();
                currentKey = arg.substring(1).toLowerCase().trim();
                groupedArgs[currentKey] = [];
            } else if (currentKey) {
                groupedArgs[currentKey].push(arg);
            }
        }
        if (currentKey) groupedArgs[currentKey] = groupedArgs[currentKey].join(' ');
        if (!('titulo' in groupedArgs && 'cuando' in groupedArgs)) {
            message.reply('los campos `cuando` y `titulo` son obligatorios.')
            return;
        }
        event.title = groupedArgs['titulo'];
        const cuando = parseInputDate(groupedArgs['cuando']);
        if (!cuando.isValid()) {
            message.reply('`cuando` tiene un formato inválido');
            return;
        }
        if (cuando.clone().subtract(10, 'minutes').isSameOrBefore(moment())) {
            message.reply(`el evento sería en menos de diez minutos! (${cuando.format(TIMESTAMP_OUTPUT)})`);
            return;
        }
        event.start = cuando.format(TIMESTAMP_FORMAT);
        for (const [argKey, objKey] of Object.entries({
            descripcion: 'description',
            link: 'link',
            lugar: 'location',
            imagen: 'imageUrl',
            color: 'color'
        })) {
            if (argKey in groupedArgs) event[objKey] = groupedArgs[argKey];
        }
        if ('fin' in groupedArgs) {
            const fin = parseInputDate(groupedArgs['fin']);
            if (fin.isValid()) event.end = fin.format(TIMESTAMP_FORMAT);
        }
        if ('color' in groupedArgs && /^[0-9a-z]{6}$/i.test(groupedArgs.color))
            event.color = groupedArgs.color
        const eventObj = await Event.create(event)
        await message.react(OK);
        scheduleEvent(context, eventObj);
        await sendEmbed(context, eventObj,
            `Añadido evento *${eventObj.title}* para el ${cuando.format(TIMESTAMP_OUTPUT)} (id ${eventObj.id}):`)
    },
    mostrar: async (message, args, context) => {
        const PAGE_SIZE = 25;
        const count = await Event.count({where: {channel_id: message.channel.id}});
        const pagesTotal = Math.ceil(count / PAGE_SIZE);
        if (pagesTotal === 0) {
            message.reply('no hay ningún evento previsto.');
            return;
        }
        const page = args[0] && !isNaN(parseInt(args[0], 10)) ? parseInt(args[0], 10) - 1 : 0;
        if (page >= pagesTotal) {
            message.reply(`página inválida (sólo hay ${pagesTotal} páginas).`);
            return;
        }
        const toSchedule = await Event.findAll({
            where: {channel_id: message.channel.id},
            order: ['start', 'id'],
            offset: page * PAGE_SIZE,
            limit: PAGE_SIZE
        });
        const embed = new MessageEmbed()
            .setTitle('Alertas de eventos' + (pagesTotal > 1 ? ` (pág. ${page}/${pagesTotal})` : ''))
            .setDescription('Esta es una lista de los próximos eventos registrados por orden de ocurrencia.')
            .addFields(...toSchedule.map(event => ({
                name: event.id + ') ' + event.title,
                value: moment(event.start, TIMESTAMP_FORMAT).format('LLL'),
                inline: true
            })));
        message.channel.send(embed).then();
    },
    borrar: async (message, args, context) => {
        if (args[0] === undefined || isNaN(parseInt(args[0], 10))) {
            message.reply('debes indicar el id del evento a borrar (utiliza `eventos mostrar` para ver los ids).');
            return;
        }
        const id = parseInt(args[0], 10);
        if (id < 0) {
            message.reply('el id debe ser mayor o igual que 0!');
            return;
        }
        const event = await Event.findOne({
            where: {channel_id: message.channel.id, id},
        });
        if (!event) {
            message.reply('no se ha encontrado el evento');
            return;
        }
        const scheduled = scheduledEvents.has(id);
        await event.destroy();
        if (scheduled) {
            clearTimeout(scheduledEvents.get(id));
            scheduledEvents.delete(id);
        }
        console.log(LOG_TAG, 'event deleted (user request): ', event.title, scheduled ? '(was scheduled)' : '(not scheduled)');
        await message.react(WASTE_BASKET);
    }
};

// Map by event id
const scheduledEvents = new Map();

/**
 * @param {string} dateIpt
 * @return {moment.Moment}
 */
function parseInputDate(dateIpt) {
    const normalised = dateIpt.toLowerCase().trim()
        .normalize("NFD")
        .replace(/[^A-Za-z\s]+/g, "")
        .replace(/\s+/g, " ");
    if (SPECIAL_TIMESTAMP_INPUTS.has(normalised)) {
        return SPECIAL_TIMESTAMP_INPUTS.get(normalised)();
    }
    let parsed = moment(dateIpt, TIMESTAMP_INPUT, true);
    if (parsed.isValid()) return parsed;
    parsed = moment(dateIpt, TIMESTAMP_INPUT_ONLY_TIME, true);
    if (parsed.isValid()) {
        if (parsed.isBefore(moment())) {
            parsed.add(1, 'days');
        }
        return parsed;
    }
    parsed = moment(normalised, ['dddd', '[el] dddd', '[proximo] dddd', '[el proximo] dddd'], 'es', true);
    if (parsed.isValid()) {
        const wanted = parsed.weekday();
        const today = moment().weekday();
        if (wanted >= today) return moment().weekday(wanted);
        else if (wanted < today) return moment().add(1, 'weeks').weekday(wanted);
    }
    return moment.invalid(); // Invalid
}

/**
 * Alerts about an event to the corresponding channel!
 * @param {Bot} context
 * @param event
 */
async function eventAlert(context, event) {
    await sendEmbed(context, event,
        `Event in ${moment(event.start, TIMESTAMP_FORMAT).diff(moment(), 'minutes')} minutes:`);
    const id = event.id;
    const scheduled = scheduledEvents.has(id);
    await event.destroy();
    if (scheduled) {
        clearTimeout(scheduledEvents.get(id));
        scheduledEvents.delete(id);
    }
    console.log(LOG_TAG, 'event deleted (notified): ', event.title, scheduled ? '(was scheduled)' : '(not scheduled)');
}

function scheduleEvent(context, event, notifyIfPassed) {
    const start = moment(event.start, TIMESTAMP_FORMAT).subtract(5, 'minutes');
    const now = moment();
    // Ignore events for more than 6h after this
    // (scheduling should be repeated in less than 6h)
    if (start.isAfter(moment().add(6, 'hours'))) return;
    if (start.isAfter(now)) {
        if (scheduledEvents.has(event.id)) return;
        scheduledEvents.set(event.id, setTimeout(eventAlert.bind(null, context, event), start.diff(now)));
        console.log(LOG_TAG, 'event scheduled', event.title, start.format(),
            `(${start.diff(now, 'minutes', true).toFixed(2)}mins.)`);
    } else if (notifyIfPassed) {
        eventAlert(context, event).then();
    }
}

async function scheduleNextEvents(context) {
    console.log(LOG_TAG, 'scheduling events for next 6h')
    // Repeat in 6 hours
    setTimeout(scheduleNextEvents.bind(null, context), 6 * 60 * 60 * 1000);

    const toSchedule = await Event.findAll({
        where: {
            start: {
                [Sequelize.Op.lte]: moment().add(6, 'hours').toDate()
            }
        }
    });
    toSchedule.forEach(toSch => scheduleEvent(context, toSch, true));
    const deleted = await Event.destroy({
        where: {start: {[Sequelize.Op.lte]: moment().toDate()}}
    });
    // Should be 0 but just in case
    if (deleted) console.log(LOG_TAG, `deleted ${deleted} events (passed).`);
}

/**
 * @param {Bot} context
 * @param event
 * @param {string} [messageText]
 * @return {Promise<void>}
 */
async function sendEmbed(context, event, messageText) {
    /**
     * @type {module:"discord.js".TextChannel|module:"discord.js".DMChannel}
     */
    const channel = await context.client.channels.fetch(event.channel_id);
    if (!['text', 'dm'].includes(channel.type)) {
        console.error(LOG_TAG, `invalid channel type for event ${event.id}: ${channel.type}`)
        return;
    }
    const creator = await context.client.users.fetch(event.creator);
    const start = moment(event.start, TIMESTAMP_FORMAT);
    const end = event.end ? moment(event.end, TIMESTAMP_FORMAT) : null;
    const embed = new MessageEmbed()
        .setTitle(event.title)
        .setAuthor(creator.username, creator.defaultAvatarURL)
        .setFooter(end ? `${start.format('lll')} - ${end.format('lll')}` : start.format('LLLL'));
    if (event.description) embed.setDescription(event.description);
    if (event.link) embed.setURL(event.link);
    if (event.color) embed.setColor(parseInt(event.color, 16));
    if (event.location) embed.setFooter(embed.footer.text + ' (' + event.location + ')');
    if (event.imageUrl) embed.setImage(event.imageUrl);
    if (messageText) {
        await channel.send(messageText, embed);
    } else {
        await channel.send(embed);
    }
}

/**
 * @type {CommandExports}
 */
module.exports = {
    init: function (context) {
        Event.init({
            channel_id: {type: Sequelize.STRING, allowNull: false},
            creator: {type: Sequelize.STRING, allowNull: false},
            title: {type: Sequelize.STRING, allowNull: false},
            description: {type: Sequelize.STRING, allowNull: true},
            start: {type: Sequelize.TEXT, allowNull: false},
            end: {type: Sequelize.TEXT, allowNull: true},
            link: {type: Sequelize.STRING, allowNull: true},
            location: {type: Sequelize.STRING, allowNull: true},
            color: {type: Sequelize.STRING, allowNull: true},
            imageUrl: {type: Sequelize.STRING, allowNull: true}
        }, {sequelize: context.sequelize, timestamps: false});
    },
    ready: async function (context) {
        await scheduleNextEvents(context);
    },
    commands: [{
        name: 'eventos',
        shortDescription: 'Notificación de eventos',
        description: 'Crea, modifica y elimina notificaciones de eventos (fecha y hora de españa).',
        usage: [],
        hidden: true,
        execute(message, args, context) {
            if (args.length === 0) {
                message.reply(`utiliza \`${context.config.prefix}ayuda evento\``
                    + ` para más información sobre cómo utilizar este comando.`)
                    .then();
                return;
            }
            if (args[0].toLowerCase() in SUBCOMMANDS) {
                const subArgs = args.slice();
                subArgs.shift();
                SUBCOMMANDS[args[0].toLowerCase()](message, subArgs, context)
            } else message.reply(`opción '${args[0]}' inválida.`).then();
        }
    }]
};
