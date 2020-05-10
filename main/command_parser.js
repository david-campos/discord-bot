class CommandParser {
    /**
     * @param {BotConfiguration} config
     */
    constructor(config) {
        this._config = config;
    }
    /**
     * @param {module:"discord.js".Message} message
     * @return {[string, string[]]} command and arguments
     */
    parse(message) {
        const args = message.content.slice(this._config.prefix.length).split(/ +/);
        const command = args.shift();
        return [command, args];
    }
}

module.exports = {CommandParser}
