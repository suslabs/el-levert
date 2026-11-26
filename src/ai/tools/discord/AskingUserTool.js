import AITool from "../AITool.js";

import AIPhases from "../../../structures/ai/AIPhases.js";

import DiscordUtil from "../../../util/DiscordUtil.js";

function getRoles(member, guildId) {
    return Array.from(member.roles.cache.values())
        .filter(role => role.id !== guildId)
        .map(role => role.name);
}

class AskingUserTool extends AITool {
    static info = {
        name: "get_asking_user",
        emoji: "👤",
        phase: AIPhases.reading,
        description: "Return the profile of the user who asked (id, mention, names, roles, join date)."
    };

    static quick = true;

    getStatus() {
        return "Checking your profile";
    }

    execute(_, session) {
        const user = session.request.author,
            member = session.request.member;

        return {
            ...DiscordUtil.getUserSummary(user, member),
            createdAt: user.createdAt.toISOString(),
            joinedServerAt: member?.joinedAt?.toISOString() ?? null,
            roles: [].concat(member !== null && getRoles(member, session.request.guildId)).filter(Boolean)
        };
    }
}

export default AskingUserTool;
