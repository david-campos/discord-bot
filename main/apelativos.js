const APELATIVOS = [
    'caranchoa',
    'cara alpargata',
    'besug@',
    'melón',
    'pastanaga',
    'trozo de mierda',
    'pedazo de perro',
    'escoria',
    'carapepino',
    'personaje',
    'fiera',
    'máquina',
    'usufructo',
    'meapilas',
    'mentecato',
    'adoquín',
    'mameluco',
    'pazguato',
    'mastuerzo',
    'atontao',
    'cenutrio',
    'zoquete',
    'berzotas',
    'bellaco',
    'bribón',
    'granuja',
    'cantamañanas',
    'alfeñique',
    'lechuguino',
    'piltrafilla',
    'carapán',
    'carapiña',
    'caracandado',
    'bocachancla',
    'bocabuzón',
    'pendejo',
    'pinche',
    'huevón',
    'boludo',
    'malandrín',
    'facineroso',
    'burricalvo',
    'botarate',
    'pagafantas',
    'perroflauta',
    'tragaldabas',
    'abrazafarolas',
    'alcornoque',
    'bebecharcos',
    'belloto',
    'bocallanta',
    'boquimuelle',
    'brasas',
    'cabezaalberca',
    'cabezabuque',
    'cabezanutria',
    'cagalindes',
    'caracaballo',
    'caracartón',
    'cebollino',
    'ceporro',
    'cernícalo',
    'comebolsas',
    'mascachapas',
    'comeflores',
    'culopollo',
    'echacantos',
    'esbaratabailes',
    'fantoche',
    'gandul',
    'gañán',
    'gilipuertas',
    'giraesquinas',
    'huelegateras',
    'lameplatos',
    'letrín',
    'matacandiles',
    'morroestufa',
    'muerdesartenes',
    'panoli',
    'parguela',
    'papanatas',
    'pataliebre',
    'patán',
    'pedorro',
    'pecholata',
    'peinabombillas',
    'peinaovejas',
    'pelagallos',
    'pelagambas',
    'pelagatos',
    'percebe',
    'pelma',
    'berberecho',
    'peterete',
    'pichabrava',
    'piltrafilla',
    'pinchauvas',
    'piojoso',
    'mugroso',
    'pocasluces',
    'quitahipos',
    'rebañasandías',
    'robaperas',
    'sacamuelas',
    'sinsustancia',
    'soplagaitas',
    'tarugo',
    'tocapelotas',
    'tolai',
    'tontaco',
    'tontucio',
    'tragaldabas',
    'tuercebotas',
    'zamacuco',
    'zopenco',
    'zurcefrenillos',
    'amigo',
    'felón',
    'tontoglande',
    'inflaescrotos',
    'bocachocho',
    'onagro',
    'vendecristos',
    'caranalga',
    'croqueto',
    'chupacables',
    'cabezapony',
    'papafrita',
    'carapasillo',
    'perr@',
    'soplamuros',
    'soplamolinos',
    'cuerpoescombro',
    'lameculos',
    'cenizo',
    'torracollons',
    'carallot',
    'bro',
    'carapostal'
];

const apelativoRandom = function() {
    return APELATIVOS[Math.round(Math.random() * (APELATIVOS.length - 1))];
}
module.exports = {
    APELATIVOS,
    apelativoRandom
};
