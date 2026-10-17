import Util from "../Util.js";

const CaseUtil = Object.freeze({
    _wordSplitRegex: /\p{Lu}{2,}(?=\p{Lu}\p{Ll}+|\p{N}|\b)|\p{Lu}?\p{Ll}+|\p{Lu}+|\p{N}+/gu,

    _upperLetterRegex: /\p{Lu}/u,
    _lowerLetterRegex: /\p{Ll}/u,

    _camelPattern: /^[a-z][a-zA-Z0-9]*$/,
    _pascalPattern: /^[A-Z][a-zA-Z0-9]*$/,
    _snakePattern: /^[a-z0-9]+(?:_[a-z0-9]+)+$/,
    _constantPattern: /^[A-Z0-9]+(?:_[A-Z0-9]+)+$/,
    _kebabPattern: /^[a-z0-9]+(?:-[a-z0-9]+)+$/,
    _cobolPattern: /^[A-Z0-9]+(?:-[A-Z0-9]+)+$/,

    _splitWords: input => {
        if (Array.isArray(input)) {
            return input.flatMap(item => CaseUtil._splitWords(item));
        } else if (typeof input !== "string" || Util.empty(input)) {
            return [];
        } else {
            return input.match(CaseUtil._wordSplitRegex) ?? [];
        }
    },

    splitWords: input => {
        return CaseUtil._splitWords(input);
    },

    toWords: (input, capitalized = false) => {
        const words = CaseUtil._splitWords(input);

        if (Util.empty(words)) {
            return "";
        }

        return words
            .map(word => {
                const lower = word.toLowerCase();
                return capitalized ? Util.capitalize(lower) : lower;
            })
            .join(" ");
    },

    isCamelCase: str => {
        if (typeof str !== "string") {
            return false;
        }

        return CaseUtil._camelPattern.test(str) && CaseUtil._upperLetterRegex.test(str);
    },

    toCamelCase: input => {
        const words = CaseUtil._splitWords(input);

        if (Util.empty(words)) {
            return "";
        }

        return words
            .map((word, i) => {
                const lower = word.toLowerCase();
                return i === 0 ? lower : Util.capitalize(lower);
            })
            .join("");
    },

    isPascalCase: str => {
        if (typeof str !== "string") {
            return false;
        }

        return CaseUtil._pascalPattern.test(str) && CaseUtil._lowerLetterRegex.test(str);
    },

    toPascalCase: input => {
        const words = CaseUtil._splitWords(input);

        if (Util.empty(words)) {
            return "";
        }

        return words.map(word => Util.capitalize(word.toLowerCase())).join("");
    },

    isSnakeCase: (str, uppercase = false) => {
        if (typeof str !== "string") {
            return false;
        }

        const pattern = uppercase ? CaseUtil._constantPattern : CaseUtil._snakePattern;
        return pattern.test(str);
    },

    toSnakeCase: (input, uppercase = false) => {
        const words = CaseUtil._splitWords(input);

        if (Util.empty(words)) {
            return "";
        }

        const snake = words.map(word => word.toLowerCase()).join("_");
        return uppercase ? snake.toUpperCase() : snake;
    },

    isKebabCase: (str, uppercase = false) => {
        if (typeof str !== "string") {
            return false;
        }

        const pattern = uppercase ? CaseUtil._cobolPattern : CaseUtil._kebabPattern;
        return pattern.test(str);
    },

    toKebabCase: (input, uppercase = false) => {
        const words = CaseUtil._splitWords(input);

        if (Util.empty(words)) {
            return "";
        }

        const kebab = words.map(word => word.toLowerCase()).join("-");
        return uppercase ? kebab.toUpperCase() : kebab;
    }
});

export default CaseUtil;
