/**
 * @typedef {module:"discord.js".DMChannel|module:"discord.js".TextChannel} DiscordChannel
 * @typedef {module:"discord.js".Message} DiscordMessage
 */

/**
 * @callback LockCallback
 * @param {DiscordMessage} message - the message received
 * @param {Bot} context - the context
 * @return {void}
 */

/**
 * This is used to lock the command parsing to a concrete function. This way,
 * the commands can require to receive all the messages in a channel until
 * they unlock it.
 */
class MessageReceptionLock {
    constructor() {
        this.messageReceptionLocks = new Map();
    }

    /**
     * @param {DiscordMessage} message
     * @return {LockCallback|null}
     */
    getLock(message) {
        if (message.channel === undefined || message.channel === null) return null;
        const key = this._lockKey(message.channel);
        return this.messageReceptionLocks.get(key) || null;
    }

    /**
     * @param {DiscordChannel} channel
     * @param {LockCallback} callback function which will process messages until the lock is released, it
     * will receive the messages and the context as arguments
     */
    lockMessageReception(channel, callback) {
        if (channel === null) throw new Error('MessageReceptionLock::lockMessageReception: channel cannot be null');
        if (callback === null) throw new Error('MessageReceptionLock::lockMessageReception: callback cannot be null');
        const key = this._lockKey(channel);
        const currentLock = this.messageReceptionLocks.get(key);
        if (currentLock) {
            throw new Error(`message lock already in use for channel ${channel.name}`);
        } else {
            this.messageReceptionLocks.set(key, callback);
        }
    }

    /**
     * @param {DiscordChannel} channel
     */
    unlockMessageReception(channel) {
        const key = this._lockKey(channel);
        if (this.messageReceptionLocks.has(key))
            this.messageReceptionLocks.delete(key);
    }

    /**
     * Get's the key for the lock for the given channel
     * @param {DiscordChannel} channel
     * @returns string
     * @private
     */
    _lockKey(channel) {
        return `${channel.type}#${channel.id}`;
    }
}

module.exports = {MessageReceptionLock}
