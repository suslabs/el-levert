import { getClient } from "../../../LevertClient.js";

import Util from "../../../util/Util.js";
import VMUtil from "../../../util/vm/VMUtil.js";

const FakeUtil = {
    reply: (reply, text, options) => {
        const format = VMUtil.formatReply(text, options);

        if (typeof format.file !== "undefined") {
            Object.assign(format, Util.getFileAttach(format.file.data, format.file.name));
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

    fetchTag: async name => {
        let tag = await getClient().tagManager.fetch(name);

        if (tag === null) {
            return null;
        }

        if (tag.isAlias) {
            tag = await getClient().tagManager.fetchAlias(tag);
        }

        return tag;
    }
};

export default FakeUtil;
