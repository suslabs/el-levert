import discord from "discord.js";
const { Attachment } = discord;
import { Buffer } from "buffer";

import { getClient } from "../../LevertClient.js";
import Util from "../../util/Util.js";

export default {
    name: "eval",
    handler: async (args, msg) => {
        let body = args;

        if(msg.attachments.size > 0) {
            try {
                [body] = await getClient().tagManager.downloadBody(msg);
            } catch(err) {
                if(err.name === "TagError") {
                    return ":warning: " + err.message;
                }

                return `:warning: Downloading attachment failed:
\`\`\`js
${err.message}
\`\`\``;
            }
        } else if(Util.isScript(body)) {
            body = Util.removeBlock(body);
        }

        if(body.length < 1) {
            return ":no_entry_sign: Can't eval an empty script.";
        }
        
        return await getClient().tagVM.runScript(body, msg);
    }
}