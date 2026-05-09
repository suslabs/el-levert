import { getClient, getEmoji } from "../../LevertClient.js";

class StopCommand {
    static info = {
        name: "stop",
        ownerOnly: true,
        category: "owner-only"
    };

    async handler(ctx) {
        await ctx.reply(`${getEmoji("info")} Stopping bot...`);

        await getClient().stop(true);
    }
}

export default StopCommand;
