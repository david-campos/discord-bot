const moment = require('moment');

class Logger {
    constructor(tag) { this.tag = tag; }
    log(...args) { console.log(`[${moment().format('HH:mm:ss')}] [${this.tag}]`, ...args); }
    error(...args) { console.error(`[${moment().format('HH:mm:ss')}] [${this.tag}]`, ...args); }
}

module.exports = {Logger}
