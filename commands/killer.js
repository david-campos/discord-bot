const {GameController} = require("../killer/killer");

const GAME_CMD = 'killer';
const JOIN_CMD = `join`;
const LEAVE_CMD = `leave`;
const START_CMD = `start`;
const CANCEL_CMD = 'cancel';

const controller = new GameController();
const MAIN_CMD = controller.cmdNewGame.bind(controller, GAME_CMD, [JOIN_CMD, LEAVE_CMD, START_CMD, CANCEL_CMD])
const SUBCOMMANDS = {
    [JOIN_CMD]: controller.cmdJoinGame.bind(controller),
    [LEAVE_CMD]: controller.cmdLeaveGame.bind(controller),
    [START_CMD]: controller.cmdStartGame.bind(controller),
    [CANCEL_CMD]: controller.cmdCancelGame.bind(controller)
};
module.exports = {
    commands: [{
        name: GAME_CMD,
        shortDescription: "Game.",
        description: "Game for at least three players about finding who is the murderer.",
        execute: (msg, args, ctx) => {
            const func = (args[0] in SUBCOMMANDS) ?
                SUBCOMMANDS[args[0]] : MAIN_CMD;
            func(msg, args, ctx).then();
        }
    }]
}
