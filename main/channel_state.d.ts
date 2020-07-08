import {DMChannel, Message, NewsChannel, TextChannel} from "discord.js";

export type DiscordChannel = DMChannel | TextChannel | NewsChannel;

/**
 * Generic base class to manage states based on messages
 */
export class StateManager<State> {
    constructor(messageToKey: (msg: Message) => string, stateConstructor: (msg: Message, bot) => State)
    getOrGenerateState(message: Message, context): State
}

/**
 * Generic class to manage states per channel
 */
export class ChannelStateManager<State> extends StateManager<State> {
    constructor(stateConstructor: (channel: DiscordChannel, bot) => State)
}

/**
 * Base class for channel states to extend from
 */
export class BaseChannelState {
    constructor(channel: DiscordChannel, context)
    lockChannel(callback: (msg: Message, bot) => void)
    unlockChannel()
}
