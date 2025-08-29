import ArrayUtil from "../ArrayUtil.js";

const FunctionUtil = Object.freeze({
    bindArgs: (fn, boundArgs) => {
        boundArgs = ArrayUtil.guaranteeArray(boundArgs);

        return function (...args) {
            return fn.apply(this, boundArgs.concat(args));
        };
    },

    _funcArgsRegex: /(?:\()(.+)+(?:\))/,
    functionArgumentNames: func => {
        const code = func.toString(),
            match = code.match(FunctionUtil._funcArgsRegex);

        if (!match) {
            return [];
        }

        const args = match[1];
        return args.split(", ").map(arg => arg.trim());
    },

    getArgumentPositions: (func, names) => {
        const argsNames = FunctionUtil.functionArgumentNames(func),
            positions = names.map(name => argsNames.indexOf(name));

        return positions.filter(pos => pos !== -1);
    }
});

export default FunctionUtil;
