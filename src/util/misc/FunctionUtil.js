const FunctionUtil = Object.freeze({
    bindArgs: (fn, boundArgs) => {
        if (!Array.isArray(boundArgs)) {
            boundArgs = [boundArgs];
        }

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
    }
});

export default FunctionUtil;
