import AISourceTypes from "../../structures/ai/AISourceTypes.js";
import PackModes from "../../structures/ai/PackModes.js";

const nomiCeuRepo = "https://raw.githubusercontent.com/Nomi-CEu/Nomi-CEu/main/overrides/config/betterquesting";

const Sources = Object.freeze({
    nomiCodex: {
        type: AISourceTypes.recipes,
        options: {
            searchUrls: [
                "https://nomi-codex.vercel.app/api/search",
                "https://nomicodex-search.cloudrender70.workers.dev/search"
            ],
            shotUrl: "https://nomi-codex.vercel.app/api/shot",
            siteUrl: "https://sayaisha.github.io/NomiCodex",
            mode: PackModes.normal
        }
    },

    nomiQuestbook: {
        type: AISourceTypes.questbook,
        options: {
            urls: {
                [PackModes.normal]: `${nomiCeuRepo}/DefaultQuests.json`,
                [PackModes.expert]: `${nomiCeuRepo}/saved_quests/ExpertQuests.json`
            },
            mode: PackModes.normal
        }
    }
});

export default Sources;
