const Sequelize = require("sequelize");

const moment = require('moment');
const {OK} = require("../guess_quizz/emojis");
const {MessageEmbed} = require('discord.js');

/**
 * Saves the events so they will not be lost if there is a crash or whatever
 */
class Event extends Sequelize.Model {
}

const TIMESTAMP_FORMAT = 'YYYY-MM-DDTHH:mm:ssZ';
const TIMESTAMP_INPUT = 'DD/MM/YYYY HH:mm';

const SUBCOMMANDS = {
    /**
     * @type {ExecuteCallback}
     */
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
        if (! ('titulo' in groupedArgs && 'cuando' in groupedArgs) ) {
            message.reply('los campos `cuando` y `titulo` son obligatorios.')
            return;
        }
        event.title = groupedArgs['titulo'];
        const cuando = moment(groupedArgs['cuando'], TIMESTAMP_INPUT, true);
        if (!cuando.isValid()) {
            message.reply('`cuando` tiene un formato inválido');
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
    }
};

const scheduledEvents = [];

/**
 * Alerts about an event to the corresponding channel!
 * @param {Bot} context
 * @param event
 */
async function eventAlert(context, event) {
    await sendEmbed(context, event);
    await event.delete();
    console.log('EVENT DELETED: ', event.title);
}

function scheduleEvent(context, event, notifyIfSoon) {
    const originalStart = moment(event.start, TIMESTAMP_FORMAT);
    const start = originalStart.clone().subtract(5, 'minutes');
    const now = moment();
    if (start.isAfter(now)) {
        scheduledEvents.push(setTimeout(eventAlert.bind(null, context, event), start.diff(now)));
        console.log('EVENT SCHEDULED: ', event.title, start.format(),
            `(${start.diff(now, 'minutes', true)}mins.)`);
    } else if(originalStart.isAfter(now) && notifyIfSoon) {
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
        const toSchedule = await Event.findAll({
            where: {start: {
                [Sequelize.Op.gt]: moment().toDate()
            }}
        });
        toSchedule.forEach(toSch => scheduleEvent(context, toSch, true));
        const deleted = await Event.destroy({
            where: {start: {[Sequelize.Op.lte]: moment().toDate()}}
        });
        if (deleted) console.log(`DELETED ${deleted} EVENTS`);
    },
    commands: [{
        name: 'evento',
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
