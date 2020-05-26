const Sequelize = require("sequelize");

const moment = require('moment');
const {OK, WASTE_BASKET} = require("../guess_quizz/emojis");
const {MessageEmbed} = require('discord.js');

/**
 * Saves the events so they will not be lost if there is a crash or whatever
 */
class Event extends Sequelize.Model {
}

const TIMESTAMP_FORMAT = 'YYYY-MM-DDTHH:mm:ssZ';
const TIMESTAMP_INPUT = 'DD/MM/YYYY HH:mm';
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
                if (currentKey) groupedArgs[currentKey] = groupedArgs[currentKey].join(' ');
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
        const cuando = moment(groupedArgs['cuando'], TIMESTAMP_INPUT, true);
        if (!cuando.isValid()) {
            message.reply('`cuando` tiene un formato inválido');
            return;
        }
        if (cuando.clone().subtract(10, 'minutes').isSameOrBefore(moment())) {
            message.reply(`el evento sería en menos de diez minutos! (${cuando.format(TIMESTAMP_INPUT)})`);
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
            const fin = moment(groupedArgs['fin'], TIMESTAMP_INPUT, true)
            if (fin.isValid()) event.end = fin.format(TIMESTAMP_FORMAT);
        }
        if ('color' in groupedArgs && /^[0-9a-z]{6}$/i.test(groupedArgs.color))
            event.color = groupedArgs.color
        const eventObj = await Event.create(event)
        await message.react(OK);
        scheduleEvent(context, eventObj);
        await sendEmbed(context, eventObj)
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
        console.log('EVENT DELETED (user request): ', event.title, scheduled ? 'was scheduled' : 'not scheduled');
        await message.react(WASTE_BASKET);
    }
};

// Map by event id
const scheduledEvents = new Map();

/**
 * Alerts about an event to the corresponding channel!
 * @param {Bot} context
 * @param event
 */
async function eventAlert(context, event) {
    await sendEmbed(context, event);
    const id = event.id;
    const scheduled = scheduledEvents.has(id);
    await event.destroy();
    if (scheduled) {
        clearTimeout(scheduledEvents.get(id));
        scheduledEvents.delete(id);
    }
    console.log('EVENT DELETED: ', event.title, scheduled ? 'was scheduled' : 'not scheduled');
}

function scheduleEvent(context, event, notifyIfPassed) {
    const start = moment(event.start, TIMESTAMP_FORMAT).subtract(5, 'minutes');
    const now = moment();
    if (start.isAfter(now)) {
        scheduledEvents.set(event.id, setTimeout(eventAlert.bind(null, context, event), start.diff(now)));
        console.log('EVENT SCHEDULED: ', event.title, start.format(),
            `(${start.diff(now, 'minutes', true)}mins.)`);
    } else if (notifyIfPassed) {
        eventAlert(context, event).then();
    }
}

/**
 * @param {Bot} context
 * @param event
 * @param [preTitle]
 * @return {Promise<void>}
 */
async function sendEmbed(context, event, preTitle) {
    /**
     * @type {module:"discord.js".TextChannel|module:"discord.js".DMChannel}
     */
    const channel = await context.client.channels.fetch(event.channel_id);
    if (!['text', 'dm'].includes(channel.type)) {
        console.error(`Invalid channel type for event ${event.id}: ${channel.type}`)
        return;
    }
    const creator = await context.client.users.fetch(event.creator);
    const start = moment(event.start, TIMESTAMP_FORMAT);
    const end = event.end ? moment(event.end, TIMESTAMP_FORMAT) : null;
    const embed = new MessageEmbed()
        .setTitle((preTitle ? preTitle : '') + event.title)
        .setAuthor(creator.username, creator.defaultAvatarURL)
        .setFooter(end ? `${start.format('lll')} - ${end.format('lll')}` : start.format('LLLL'));
    if (event.description) embed.setDescription(event.description);
    if (event.link) embed.setURL(event.link);
    if (event.color) embed.setColor(parseInt(event.color, 16));
    if (event.location) embed.setFooter(embed.footer.text + ' (' + event.location + ')');
    if (event.imageUrl) embed.setImage(event.imageUrl);
    await channel.send(embed);
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
        const deleted = await Event.destroy({
            where: {start: {[Sequelize.Op.lte]: moment().toDate()}}
        });
        if (deleted) console.log(`DELETED ${deleted} EVENTS`);
        const toSchedule = await Event.findAll({
            where: {
                start: {
                    [Sequelize.Op.gt]: moment().toDate()
                }
            }
        });
        toSchedule.forEach(toSch => scheduleEvent(context, toSch, true));
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
