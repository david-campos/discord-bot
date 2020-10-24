/**
 * @param {Array} array
 * @return {number} a random idx from the array
 */
function pickRandomIdx(array) {
    return Math.round(Math.random() * (array.length - 1));
}

/**
 * @template T
 * @param {Array<T>} array
 * @return {T|null} random element from array
 */
function pickRandomElement(array) {
    if (array.length === 0) return null;
    else return array[pickRandomIdx(array)];
}

/**
 * @template T
 * @param {Array<T>} array
 * @return {T|null} item removed from the array
 */
function popRandomElement(array) {
    if (array.length === 0) return null;
    else return array.splice(pickRandomIdx(array), 1)[0];
}

module.exports = {pickRandomElement, pickRandomIdx, popRandomElement};
