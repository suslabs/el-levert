import discord from "discord.js";
const { Attachment } = discord;
import { Buffer } from "buffer";

import { getClient } from "../../LevertClient.js";

export default {
    name: "eval",
    handler: async (args, msg) => {
        return await getClient().tagVM.runScript(args, msg, {
            args: args
        });
    }
}