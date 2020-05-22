/**
 * @callback MessageToKeyCallback
 * @param {module:"discord.js".Message} message
 * @return {string} state key for the given message
 */

/**
 * @typedef {module:"discord.js".Message} DiscordMessage
 * @typedef {module:"discord.js".TextChannel | module:"discord.js".DMChannel | module:"discord.js".NewsChannel} DiscordChannel
 */

/**
 * Generic base class to manage states based on messages
 * @template State
 * @property {Map<string, State>} states
 */
class StateManager {
    /**
     * @param {MessageToKeyCallback} messageToKey
     * @param {function(DiscordMessage, Bot): State} stateConstructor
     */
    constructor(messageToKey, stateConstructor) {
        this.states = new Map();
        this.messageToKey = messageToKey;
        this.stateConstructor = stateConstructor;
    }

    /**
     * @param {module:"discord.js".Message} message
     * @param {Bot} context
     * @return {State}
     */
    getOrGenerateState(message, context) {
        const key = this.messageToKey(message);
        if (this.states.has(key)) {
            return this.states.get(message.channel.id);
        } else {
            const state = this.stateConstructor(message, context);
            this.states.set(key, state);
            return state;
        }
    }
}

/**
 * Generic class to manage states per channel
 * @template State
 * @extends StateManager<State>
 */
class ChannelStateManager extends StateManager {
    /**
     * @param {function(DiscordChannel, Bot): State} stateConstructor
     */
    constructor(stateConstructor) {
        super(
            message => message.channel.id,
            (message, bot) => stateConstructor(message.channel, bot)
        );
    }
}

/**
 * Base class for channel states to extend from
 * @property {DiscordChannel} channel
 * @property {Bot} context
 */
class BaseChannelState {
    /**
     * @param {DiscordChannel} channel
     * @param {Bot} context
     */
    constructor(channel, context) {
        this.channel = channel;
        this.context = context;
    }

    /**
     * @param {LockCallback} callback
     */
    lockChannel(callback) {
        this.context.lockMessageReception(this.channel, callback);
    }

    unlockChannel() {
        this.context.unlockMessageReception(this.channel);
    }
}

module.exports = {
    StateManager,
    ChannelStateManager,
    BaseChannelState
}
