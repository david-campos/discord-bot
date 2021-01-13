/**
 * Normalizes the string so it can be compared
 * @param str
 * @returns {string}
 */
function normalize(str) {
    return str.toLowerCase().trim()
        .normalize("NFD")
        .replace(/[^A-Za-z0-9\s\-]+/g, "")
        .replace(/(\s|-)+/g, " ");
}

/**
 * Turns the first character into uppercase
 * @param {string} str
 */
function capitalize(str) {
    const char = str.charCodeAt(0);
    const a = "a".charCodeAt(0);
    const z = "z".charCodeAt(0);
    if (char >= a && char <= z)
        return str[0].toLocaleUpperCase() + str.slice(1);
    else
        return str;
}

module.exports = {normalize, capitalize};
