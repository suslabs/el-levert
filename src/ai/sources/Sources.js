import { fileURLToPath } from "node:url";

import AISourceTypes from "../../structures/ai/AISourceTypes.js";
import PackModes from "../../structures/PackModes.js";

const Sources = Object.freeze({
    nomiCodex: {
        type: AISourceTypes.recipes,
        priority: 3,
        options: {
            searchUrls: [
                "https://nomi-codex.vercel.app/api/search",
                "https://nomicodex-search.cloudrender70.workers.dev/search"
            ],
            shotUrl: "https://nomi-codex.vercel.app/api/shot",
            mode: PackModes.normal
        }
    },

    wikipedia: {
        type: AISourceTypes.wiki,
        priority: 1,
        options: {
            name: "Wikipedia",
            host: "wikipedia.org",
            language: "en",
            userAgent: "ElLevert/1.0 (Discord bot)"
        }
    },

    gregtech: {
        type: AISourceTypes.gameDocs,
        priority: 2,
        options: {
            name: "GregTech CEu reference",
            files: [fileURLToPath(new URL("../docs/gregtech.md", import.meta.url))]
        }
    },

    scriptDocs: {
        type: AISourceTypes.scriptDocs,
        priority: 1,
        options: {
            name: "script and CanvasKit docs",
            files: [fileURLToPath(new URL("../docs/scripts.md", import.meta.url))],
            urls: {
                "CanvasKit loader reference":
                    "https://raw.githubusercontent.com/Alex31TheDev/cycdraw/main/canvaskit/canvaskitloader.d.ts"
            }
        }
    }
});

export default Sources;
