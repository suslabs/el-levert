import AITool from "../AITool.js";

import AIPhases from "../../../structures/ai/AIPhases.js";

import { getClient, getConfig } from "../../../LevertClient.js";

class BotProfileTool extends AITool {
    static info = {
        name: "get_bot_profile",
        emoji: "🐰",
        phase: AIPhases.reading,
        description: "Return this bot's own profile (name, mention, version, prefix, model)."
    };

    static quick = true;

    getStatus() {
        return "Checking my profile";
    }

    execute(_, session) {
        const client = getClient(),
            user = client.client.user;

        return {
            id: user.id,
            mention: `<@${user.id}>`,
            username: user.username,
            version: client.version,
            commandPrefix: getConfig().cmdPrefix,
            model: session.model
        };
    }
}

export default BotProfileTool;
