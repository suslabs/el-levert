import AISourceTypes from "../../structures/ai/AISourceTypes.js";
import PackModes from "../../structures/ai/PackModes.js";

import HTTPUtil from "../../util/vm/HTTPUtil.js";

const nomiCeuOverrides = "https://raw.githubusercontent.com/Nomi-CEu/Nomi-CEu/main/overrides/config-overrides";

const Sources = Object.freeze({
    nomiCodex: {
        type: AISourceTypes.recipes,
        options: {
            searchUrls: [
                "https://nomi-codex.vercel.app/api/search",
                "https://nomicodex-search.cloudrender70.workers.dev/search"
            ],
            shotUrl: "https://nomi-codex.vercel.app/api/shot",
            mode: PackModes.normal
        }
    },

    nomiQuestbook: {
        type: AISourceTypes.questbook,
        options: {
            urls: {
                [PackModes.normal]: HTTPUtil.joinUrl(nomiCeuOverrides, "normal/betterquesting/DefaultQuests.json"),
                [PackModes.expert]: HTTPUtil.joinUrl(nomiCeuOverrides, "expert/betterquesting/DefaultQuests.json")
            },
            mode: PackModes.normal
        }
    },

    wikipedia: {
        type: AISourceTypes.wiki,
        options: {
            name: "Wikipedia",
            host: "wikipedia.org",
            language: "en",
            userAgent: "ElLevert/1.0 (Discord bot)"
        }
    }
});

export default Sources;
