class StateManager {
    constructor(messageToKey, stateConstructor) {
        this.states = new Map();
        this.messageToKey = messageToKey;
        this.stateConstructor = stateConstructor;
    }

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

class ChannelStateManager extends StateManager {
    constructor(stateConstructor) {
        super(
            message => message.channel.id,
            (message, bot) => stateConstructor(message.channel, bot)
        );
    }
}

class BaseChannelState {
    constructor(channel, context) {
        this.channel = channel;
        this.context = context;
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
