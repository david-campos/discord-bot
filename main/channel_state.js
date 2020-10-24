class StateManager {
    constructor(messageToKey, stateConstructor) {
        this._states = new Map();
        this._messageToKey = messageToKey;
        this._stateConstructor = stateConstructor;
    }

    hasState(message) {
        const key = this._messageToKey(message);
        return this._states.has(key);
    }

    removeState(key) {
        return this._states.delete(key);
    }

    getOrGenerateState(message, context) {
        const key = this._messageToKey(message);
        if (this._states.has(key)) {
            return this._states.get(message.channel.id);
        } else {
            const state = this._stateConstructor(message, context, key);
            this._states.set(key, state);
            return state;
        }
    }
}

class ChannelStateManager extends StateManager {
    constructor(stateConstructor) {
        super(
            message => message.channel.id,
            (message, bot, key) => stateConstructor(message.channel, bot, key)
        );
    }
}

class BaseChannelState {
    constructor(channel, context, key) {
        this.channel = channel;
        this.context = context;
        this.key = key;
    }

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
