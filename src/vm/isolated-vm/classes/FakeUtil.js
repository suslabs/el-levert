import ivm from "isolated-vm";
const { ExternalCopy } = ivm;

import FakeUser from "./FakeUser.js";

import { getClient } from "../../../LevertClient.js";
import VMUtil from "../../../util/vm/VMUtil.js";

const FakeUtil = {
    findUsers: async search => {
        let data = await getClient().findUsers(search);
        data = data.map(user => new FakeUser(user).fixedUser);

        return new ExternalCopy(data).copyInto();
    },
    fetchTag: async name => {
        let tag = await getClient().tagManager.fetch(name);

        if (!tag) {
            return undefined;
        }

        if (tag.isAlias) {
            tag = await getClient().tagManager.fetchAlias(tag);
            tag.setName(name);
        }

        return new ExternalCopy(tag).copyInto();
    },
    findTags: async query => {
        const tags = await getClient().tagManager.search(query);
        return new ExternalCopy(tags).copyInto();
    },
    dumpTags: async full => {
        const tags = await getClient().tagManager.dump(full);
        return new ExternalCopy(tags).copyInto();
    },
    fetchMessage: async (user_id, default_id, ch_id, msg_id) => {
        if (ch_id === null || typeof ch_id === "undefined") {
            ch_id = default_id;
        }

        let msg = await getClient().fetchMessage(ch_id, msg_id, user_id);

        if (!msg) {
            return undefined;
        }

        msg = VMUtil.removeCircRef(msg);
        return new ExternalCopy(msg).copyInto();
    },
    fetchMessages: async (user_id, default_id, ch_id, options) => {
        if (ch_id === null || typeof ch_id === "undefined") {
            ch_id = default_id;
        }

        let msgs = await getClient().fetchMessages(ch_id, options, user_id);

        if (!msgs) {
            return undefined;
        }

        msgs = msgs.map(msg => VMUtil.removeCircRef(msg));
        return new ExternalCopy(msgs).copyInto();
    }
};

export default FakeUtil;
