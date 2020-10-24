import {DMChannel, Message, NewsChannel, TextChannel} from "discord.js";

export type DiscordChannel = DMChannel | TextChannel | NewsChannel;

/**
 * Generic base class to manage states based on messages
 */
export class StateManager<State, StateKey> {
    constructor(messageToKey: (msg: Message) => StateKey, stateConstructor: (msg: Message, bot, key: StateKey) => State)
    hasState(message: Message): boolean
    removeState(key: StateKey): boolean
    getOrGenerateState(message: Message, context): State
    private _states: Map<StateKey, State>
    private _messageToKey: (msg: Message) => StateKey
    private _stateConstructor: (msg: Message, bot) => State
}

export type ChannelStateKey = string;

/**
 * Generic class to manage states per channel
 */
export class ChannelStateManager<State> extends StateManager<State, ChannelStateKey> {
    constructor(stateConstructor: (channel: DiscordChannel, bot, key: ChannelStateKey) => State)
}

/**
 * Base class for channel states to extend from
 */
export class BaseChannelState {
    constructor(channel: DiscordChannel, context, key: ChannelStateKey)
    readonly channel: DiscordChannel;
    readonly context;
    readonly key: ChannelStateKey;
    lockChannel(callback: (msg: Message, bot) => void)
    unlockChannel()
}
