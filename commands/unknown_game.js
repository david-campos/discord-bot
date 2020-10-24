const {GameController} = require("../test/test");

const GAME_CMD = 'game';
const JOIN_CMD = 'game-join';
const LEAVE_CMD = 'game-leave';
const START_CMD = 'game-start';

const controller = new GameController();
module.exports = {
    commands: [{
        name: GAME_CMD,
        hidden: true,
        execute: controller.cmdNewGame.bind(controller, [JOIN_CMD, LEAVE_CMD, START_CMD])
    }, {
        name: JOIN_CMD,
        hidden: true,
        execute: controller.cmdJoinGame.bind(controller)
    },{
        name: LEAVE_CMD,
        hidden: true,
        execute: controller.cmdLeaveGame.bind(controller)
    },{
        name: START_CMD,
        hidden: true,
        execute: controller.cmdStartGame.bind(controller)
    }]
}
