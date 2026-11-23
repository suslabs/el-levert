import AITool from "../AITool.js";

import AIPhases from "../../../structures/ai/AIPhases.js";

class AskingUserTool extends AITool {
    static info = {
        name: "get_asking_user",
        emoji: "👤",
        phase: AIPhases.reading,
        description: "Return the profile of the user who asked (id, mention, names, roles, join date)."
    };

    getStatus() {
        return "Checking your profile";
    }

    execute(_, session) {
        const user = session.request.author,
            member = session.request.member;

        return {
            id: user.id,
            mention: `<@${user.id}>`,
            username: user.username,
            displayName: member?.displayName ?? user.globalName ?? user.username,
            bot: user.bot,
            createdAt: user.createdAt.toISOString(),
            joinedServerAt: member?.joinedAt?.toISOString() ?? null,
            roles: member === null ? [] : this._getRoles(member, session.request.guildId)
        };
    }

    _getRoles(member, guildId) {
        return Array.from(member.roles.cache.values())
            .filter(role => role.id !== guildId)
            .map(role => role.name);
    }
}

export default AskingUserTool;
