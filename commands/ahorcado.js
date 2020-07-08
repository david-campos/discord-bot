const {AhorcadoController} = require("../ahorcado/AhorcadoGame");

const controller = new AhorcadoController();

module.exports = {
    commands: [{
        name: 'ahorcado',
        hidden: true,
        shortDescription: 'Juego del ahorcado',
        description: 'Propone una palabra para acertar y los jugadores pueden proveer letras para acertarla',
        execute: controller.cmdNewWord.bind(controller)
    }]
}
