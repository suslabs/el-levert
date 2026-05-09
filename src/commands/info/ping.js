import { getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import Benchmark from "../../util/misc/Benchmark.js";

class PingCommand {
    static info = {
        name: "ping",
        aliases: ["p"],
        category: "info"
    };

    async handler(ctx) {
        const timeKey = Benchmark.startTiming(Symbol("ping"));

        const sentMessage = await ctx.reply(`${getEmoji("info")} Pinging...`);

        const sentTimestamp = sentMessage.createdTimestamp,
            originalTimestamp = ctx.msg.createdTimestamp;

        const totalLatency = Util.timeDelta(sentTimestamp, originalTimestamp),
            serverLatency = Benchmark.stopTiming(timeKey, false);

        const totalWarn = totalLatency > 1000 ? ` ${getEmoji("warn")}` : "",
            serverWarn = serverLatency > 100 ? ` ${getEmoji("warn")}` : "";

        await ctx.edit(
            `${getEmoji("ok")} Pong!\n` +
                `**Total latency:** \`${totalLatency}ms\`${totalWarn}\n` +
                `**Server latency:** \`${serverLatency}ms\`${serverWarn}`
        );
    }
}

export default PingCommand;
