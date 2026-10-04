import { getClient } from "../../../LevertClient.js";

import ObjectUtil from "../../../util/ObjectUtil.js";
import DiscordUtil from "../../../util/DiscordUtil.js";
import VMUtil from "../../../util/vm/VMUtil.js";

const FakeUtil = Object.freeze({
    reply: (reply, text, options) => {
        const format = VMUtil.formatReply(text, options);

        if (typeof format.file !== "undefined") {
            Object.assign(format, DiscordUtil.getFileAttach(format.file.data, format.file.name));
        }

        reply.reply = format;
    },

    findUsers: name => {
        const func = getClient().findUsers.bind(getClient());
        return func(name);
    },

    dumpTags: () => {
        const func = getClient().tagManager.dump.bind(getClient().tagManager);
        return func();
    },

    fetchTag: async (name, options) => {
        options = typeof options === "boolean" ? { aliasOriginal: options } : ObjectUtil.guaranteeObject(options);

        const aliasOriginal = options.aliasOriginal ?? false;

        let tag = await getClient().tagManager.fetch(name);

        if (tag === null) {
            return null;
        }

        if (tag.isAlias) {
            tag = await getClient().tagManager.fetchAlias(tag, aliasOriginal);
        }

        return tag;
    }
});

export default FakeUtil;
