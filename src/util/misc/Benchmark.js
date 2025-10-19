import Util from "../Util.js";

class Benchmark {
    static runFunction(name, runs, func, ...args) {
        let result = null;

        let min = Number.MAX_VALUE,
            max = 0,
            sum = 0;

        for (let i = 1; i <= runs; i++) {
            const t1 = performance.now(),
                out = func(...args);

            const t2 = performance.now(),
                elapsed = Util.timeDelta(t2, t1);

            if (result === null) {
                result = out;
            }

            min = Math.min(min, elapsed);
            max = Math.max(max, elapsed);
            sum += elapsed;
        }

        const avg = sum / runs;

        const minStr = Math.round(min * 1000).toLocaleString(),
            maxStr = Math.round(max * 1000).toLocaleString();

        const avgStr = Math.round(avg * 1000).toLocaleString(),
            sumStr = Util.round(sum / 1000, 3);

        console.log(
            `${name} - ${runs} runs | min: ${minStr}us | max: ${maxStr}us | avg: ${avgStr}us | total: ${sumStr}s`
        );

        return [min, max, avg, sum, result];
    }
}

export default Benchmark;
