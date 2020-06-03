const Sequelize = require("sequelize");
const path = require('path');

const moment = require('moment');
const {Logger} = require("../logging/logger");
const {OK, WRONG, WASTE_BASKET} = require("../guess_quizz/emojis");
const {MessageEmbed} = require('discord.js');

const logger = new Logger(path.basename(__filename));

/**
 * Saves the events so they will not be lost if there is a crash or whatever
 */
class Event extends Sequelize.Model {
}

const TIMESTAMP_FORMAT = 'YYYY-MM-DDTHH:mm:ss.SSS';
const TIMESTAMP_INPUT = [
    'DD/MM/YYYY HH:mm', 'DD/MM/YYYY H:m',
    'DD/MM/YY HH:mm', 'DD/MM/YY H:m',
    'D/M/YY HH:mm', 'D/M/YY H:m',
    'D/M HH:mm', 'D/M H:m'
];
const TIMESTAMP_INPUT_ONLY_TIME = ['HH:mm', 'H:mm', 'H:m', 'HH', 'H'];
const TIMESTAMP_INPUT_ONLY_DATE = ['DD/MM/YYYY', 'DD/MM/YY', 'D/M/YY', 'D/M'];
const TIMESTAMP_OUTPUT = TIMESTAMP_INPUT[0];

/**
 * @type {{c: ExecuteCallback, crear: ExecuteCallback, mostrar: ExecuteCallback, borrar: ExecuteCallback, limpiar: ExecuteCallback}}
 */
const SUBCOMMANDS = {
    c: async (message, args, context) => {
        let start = moment.invalid();
        let withHour = false;
        let i = Math.min(8, args.length);
        for (/* nothing */; i > 0; i--) {
            [start, withHour] = parseInputDate(args.slice(0, i).join(' '));
            if (start.isValid()) break;
        }
        if (!start.isValid()) {
            message.reply('la fecha / hora tiene un formato inválido');
            return;
        }
        const notifyAt = defaultNotifyAtFor(start, withHour);
        if (notifyAt.isBefore(moment().add(30, 'seconds'))) {
            message.reply('se tendría que notificar en menos de 30 segundos!');
            return;
        }
        const title = args.slice(i).join(' ');
        await registerEvent(context, {
            title,
            start: start.format(TIMESTAMP_FORMAT),
            wholeDay: !withHour,
            notifyAt: notifyAt.format(TIMESTAMP_FORMAT),
            channel_id: message.channel.id,
            creator: message.author.id
        });
        await message.react(OK);
    },
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
        const [cuando, withHour] = parseInputDate(groupedArgs['cuando']);
        if (!cuando.isValid()) {
            message.reply('`cuando` tiene un formato inválido');
            return;
        }
        event.start = cuando.format(TIMESTAMP_FORMAT);
        event.wholeDay = !withHour;
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
            const [fin, endWithHour] = parseInputDate(groupedArgs['fin']);
            if (endWithHour === withHour && fin.isValid()) event.end = fin.format(TIMESTAMP_FORMAT);
        }
        if ('notificar' in groupedArgs) {
            const [notificar, withHour] = parseInputDate(groupedArgs['notificar']);
            if (notificar.isValid() && withHour) event.notifyAt = notificar.format(TIMESTAMP_FORMAT);
            else {
                message.reply('`notificar` tiene formato inválido');
                return;
            }
        } else {
            event.notifyAt = defaultNotifyAtFor(cuando, withHour).format(TIMESTAMP_FORMAT);
        }
        if (moment(event.notifyAt, TIMESTAMP_FORMAT).subtract(30, 'seconds').isBefore(moment())) {
            message.reply(`el evento se notificaría en menos de 30 segundos! (${cuando.format(TIMESTAMP_OUTPUT)})`);
            return;
        }
        if ('color' in groupedArgs && /^[0-9a-z]{6}$/i.test(groupedArgs.color))
            event.color = groupedArgs.color
        await registerEvent(context, event);
        await message.react(OK);
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
            order: ['notifyAt', 'id'],
            offset: page * PAGE_SIZE,
            limit: PAGE_SIZE
        });
        const embed = new MessageEmbed()
            .setTitle('Alertas de eventos' + (pagesTotal > 1 ? ` (pág. ${page}/${pagesTotal})` : ''))
            .setDescription('Esta es una lista de los próximos eventos registrados por orden de notificación.')
            .addFields(...toSchedule.map(event => ({
                name: event.id + ') ' + event.title,
                value: moment(event.notifyAt, TIMESTAMP_FORMAT).format('LLL'),
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
            where: {channel_id: message.channel.id, id}
        });
        if (!event) {
            message.reply('no se ha encontrado el evento');
            return;
        }
        await destroyEvent(event, 'user request');
        await message.react(WASTE_BASKET);
    },
    limpiar: async (message, args, context) => {
        if (message.author.id !== '424966681778061335') {
            message.reply('no tienes permiso para iniciar tal cruzada, amigo.');
            return;
        }
        const deleted = await Event.destroy({
            where: {channel_id: message.channel.id}
        });
        for (const key of scheduledEvents.keys()) {
            clearTimeout(scheduledEvents.get(key));
            scheduledEvents.delete(key);
        }
        await scheduleNextEvents(context, true);
        logger.log('all events for one channel deleted (user request)');
    }
};

/**
 * @type {CommandArgumentDefinition}
 */
const SUBCOMMAND_ARGS = [
    [
        {name: 'c', description: 'usado para crear un evento de forma rápida', isLiteral: true},
        {
            name: 'fecha', description: 'al crear un evento de forma rápida, la fecha y hora de comienzo del evento',
            format: 'formato de fechas más abajo'
        },
        {name: 'titulo', description: 'al crear un evento de forma rápida, título del evento'}
    ],
    [
        {name: 'crear', description: 'usado para crear un evento de forma rápida', isLiteral: true},
        {
            name: 'fecha', description: 'al crear un evento de forma rápida, la fecha y hora de comienzo del evento',
            format: 'formato de fechas más abajo'
        },
        {name: 'titulo', description: 'al crear un evento de forma rápida, título del evento'}
    ],
    [
        {name: 'mostrar', description: 'muestra los eventos programados para este canal', isLiteral: true},
        {
            name: 'pagina', description: 'al mostrar los eventos, página a mostrar', optional: true,
            format: 'entero mayor o igual que 1', defaultValue: 1
        },
    ],
    [
        {name: 'borrar', description: 'borra eventos programados para este canal', isLiteral: true},
        {name: 'id', description: 'id del evento a borrar, puede leerse en mostrar eventos'},
    ]
];

// Map by event id
const scheduledEvents = new Map();

/**
 * @param {moment.Moment} start
 * @param {boolean} withHour
 * @return {moment.Moment}
 */
function defaultNotifyAtFor(start, withHour) {
    if (withHour) return start.clone().subtract(5, 'minutes');
    else return start.clone().hour(8).minutes(0);
}

async function registerEvent(context, event) {
    const eventObj = await Event.create(event)
    const cuando = moment(event.notifyAt, TIMESTAMP_FORMAT);
    scheduleEvent(context, eventObj);
    await sendEmbed(context, eventObj,
        `Añadido evento *${eventObj.title}* (id ${eventObj.id}) para notificar el ${cuando.format('LLLL')}:`);
}

async function destroyEvent(event, reason) {
    const id = event.id;
    await event.destroy();
    const scheduled = scheduledEvents.has(id);
    if (scheduled) {
        clearTimeout(scheduledEvents.get(id));
        scheduledEvents.delete(id);
    }
    logger.log(
        `event deleted${reason ? `(${reason})` : ''}:`,
        event.id, event.title,
        scheduled ? '(was scheduled)' : '(not scheduled)');
}

/**
 * @param {string} dateIpt
 * @return {[moment.Moment, boolean]} first the parsed moment, second whether it includes hour or not
 */
function parseInputDate(dateIpt) {
    let normalised = dateIpt.toLowerCase()
        .normalize("NFD")
        .replace(/[^A-Za-z0-9:\s]+/g, "")
        .replace(/\s+/g, " ")
        .trim();
    let parsed = moment(dateIpt, TIMESTAMP_INPUT, true);
    if (parsed.isValid()) return [parsed, true];
    // Only date
    parsed = moment(dateIpt, TIMESTAMP_INPUT_ONLY_DATE, true);
    if (parsed.isValid()) {
        return [parsed, false];
    }
    // Only time
    parsed = moment(dateIpt, TIMESTAMP_INPUT_ONLY_TIME, true);
    if (parsed.isValid()) {
        if (parsed.isBefore(moment())) {
            parsed.add(1, 'days');
        }
        return [parsed, true];
    }

    // Get hour if at the end
    const idx = normalised.lastIndexOf(' ');
    let hour = moment.invalid();
    if (idx >= 0) {
        const lastWord = normalised.substring(idx + 1);
        hour = moment(lastWord, TIMESTAMP_INPUT_ONLY_TIME, true);
    }
    if (hour.isValid()) normalised = normalised.substring(0, idx);

    // Remove irrelevant prefixes
    for (const prefix of ['el ', 'proximo ']) {
        if (normalised.startsWith(prefix)) {
            normalised = normalised.substring(prefix.length);
        }
    }

    // Remove irrelevant suffixes
    for (const suffix of [' a las', ' a la']) {
        if (normalised.endsWith(suffix)) {
            normalised = normalised.substring(0, normalised.length - suffix.length);
        }
    }

    parsed = moment(normalised, 'dddd', 'es', true);
    if (parsed.isValid()) {
        const wanted = parsed.weekday();
        const today = moment().weekday();
        const result = moment().startOf('day');
        if (wanted >= today) result.weekday(wanted);
        else if (wanted < today) result.add(1, 'weeks').weekday(wanted);

        if (hour.isValid()) result.hour(hour.hour()).minute(hour.minute());
        return [result, hour.isValid()];
    }

    if (['manana', 'pasado'].includes(normalised)) {
        const result = moment().add(normalised === 'manana' ? 1 : 2, 'days').startOf('day');
        if (hour.isValid()) result.hour(hour.hour()).minute(hour.minute());
        return [result, hour.isValid()];
    }
    return [moment.invalid(), false]; // Invalid
}

/**
 * Alerts about an event to the corresponding channel!
 * @param {Bot} context
 * @param event
 */
async function eventAlert(context, event) {
    const duration = moment.duration(
        moment(event.start, TIMESTAMP_FORMAT)
            .seconds(0).milliseconds(0).diff(
            moment().seconds(0).milliseconds(0)
        )
    ).locale('es');
    await sendEmbed(context, event,
        `Evento ${duration.humanize(true)}:`);
    await destroyEvent(event, 'notified');
}

function scheduleEvent(context, event, notifyIfPassed) {
    const notify = moment(event.notifyAt, TIMESTAMP_FORMAT);
    const now = moment();
    // Ignore events for more than 6h after this
    // (scheduling should be repeated in less than 6h)
    if (notify.isAfter(moment().add(6, 'hours'))) return;
    if (notify.isAfter(now)) {
        if (scheduledEvents.has(event.id)) return;
        scheduledEvents.set(event.id, setTimeout(eventAlert.bind(null, context, event), notify.diff(now)));
        logger.log('event scheduled', event.id, event.title, notify.format(),
            `(${notify.diff(now, 'minutes', true).toFixed(2)}mins.)`);
    } else if (notifyIfPassed) {
        eventAlert(context, event).then();
        logger.log('event alerted in scheduling', event.id, event.title, notify.format());
    } else {
        destroyEvent(event, 'dimissed').then();
        logger.log('event dismissed in scheduling', event.id, event.title, notify.format());
    }
}

async function scheduleNextEvents(context, doNotRepeat) {
    // Repeat in 6 hours
    if (!doNotRepeat) {
        setTimeout(scheduleNextEvents.bind(null, context), 6 * 60 * 60 * 1000);
    }

    const toSchedule = await Event.findAll({
        where: {
            notifyAt: {
                [Sequelize.Op.lte]: moment().add(6, 'hours').format(TIMESTAMP_FORMAT)
            }
        }
    });
    logger.log(`scheduling events for next 6h (${toSchedule.length} events)`);
    toSchedule.forEach(toSch => scheduleEvent(context, toSch, true));
    const deleted = await Event.destroy({
        where: {notifyAt: {[Sequelize.Op.lte]: moment().format(TIMESTAMP_FORMAT)}}
    });
    // Should be 0 but just in case
    if (deleted) logger.log(`deleted ${deleted} events (passed).`);
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
        logger.error(`invalid channel type for event ${event.id}: ${channel.type}`)
        return;
    }
    const creator = await context.client.users.fetch(event.creator);
    const start = moment(event.start, TIMESTAMP_FORMAT);
    const end = event.end ? moment(event.end, TIMESTAMP_FORMAT) : null;
    const embed = new MessageEmbed()
        .setTitle(event.title)
        .setAuthor(creator.username, creator.defaultAvatarURL)
        .setFooter(end ? `${
            start.format(event.wholeDay ? 'll' : 'lll')
        } - ${
            end.format(event.wholeDay ? 'll' : 'lll')
        }` : start.format(event.wholeDay ? 'LL' : 'LLLL'));
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
            notifyAt: {type: Sequelize.TEXT, allowNull: false},
            wholeDay: {type: Sequelize.BOOLEAN, defaultValue: false},
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
        usage: [{group: 'choice', args: SUBCOMMAND_ARGS}],
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
