import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import VMUtil from "../../util/VMUtil.js";

const FakeUtil = {
    reply: (reply, text, options) => {
        let format = VMUtil.formatReply(text, options);

        if (typeof format.file !== "undefined") {
            format = {
                ...format,
                ...Util.getFileAttach(format.file.data, format.file.name)
            };
        }

        reply.reply = format;
    },
    findUsers: name => {
        const func = getClient().findUsers.bind(getClient());
        return func(name);
    },
    dumpTags: _ => {
        const func = getClient().tagManager.dump.bind(getClient().tagManager);
        return func();
    },
    fetchTag: async name => {
        let tag = await getClient().tagManager.fetch(name);

        if (!tag) {
            return undefined;
        }

        if (tag.hops.length > 1) {
            tag = await getClient().tagManager.fetchAlias(tag);
        }

        return tag;
    }
};

export default FakeUtil;
