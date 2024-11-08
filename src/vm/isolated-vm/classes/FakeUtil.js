import ivm from "isolated-vm";
const { ExternalCopy } = ivm;

import FakeMsg from "./FakeMsg.js";
import FakeUser from "./FakeUser.js";

import { getClient } from "../../../LevertClient.js";
import Util from "../../../util/Util.js";
import VMUtil from "../../../util/vm/VMUtil.js";

const FakeUtil = {
    getInfo: _ => ({
        version: getClient().version,
        env: `El Levert ${getClient().version}`,

        timeLimit: getClient().tagVM.timeLimit / Util.durationSeconds.milli,
        inspectorEnabled: getClient().tagVM.enableInspector,

        outCharLimit: getClient().tagVM.outCharLimit,
        outNewlineLimit: getClient().tagVM.outNewlineLimit
    }),

    fetchTag: async name => {
        let tag = await getClient().tagManager.fetch(name);

        if (!tag) {
            return undefined;
        }

        if (tag.isAlias) {
            tag = await getClient().tagManager.fetchAlias(tag);
            tag.setName(name);
        }

        const data = tag.getData();
        return new ExternalCopy(data).copyInto();
    },

    findTags: async query => {
        const tags = await getClient().tagManager.search(query);
        return new ExternalCopy(tags).copyInto();
    },

    dumpTags: async full => {
        let tags = await getClient().tagManager.dump(full);

        if (full) {
            tags = tags.map(tag => tag.getData());
        }

        return new ExternalCopy(tags).copyInto();
    },

    fetchMessage: async (user_id, default_id, ch_id, msg_id) => {
        if (ch_id === null || typeof ch_id === "undefined") {
            ch_id = default_id;
        }

        let msg = await getClient().fetchMessage(ch_id, msg_id, {
            user_id,
            checkAccess: true
        });

        if (!msg) {
            return undefined;
        }

        msg = new FakeMsg(msg).fixedMsg;
        return new ExternalCopy(msg).copyInto();
    },

    fetchMessages: async (user_id, default_id, ch_id, fetchOptions) => {
        if (ch_id === null || typeof ch_id === "undefined") {
            ch_id = default_id;
        }

        let msgs = await getClient().fetchMessages(
            ch_id,
            {
                user_id,
                checkAccess: true
            },
            fetchOptions
        );

        if (!msgs) {
            return undefined;
        }

        msgs = msgs.map(msg => new FakeMsg(msg).fixedMsg);
        return new ExternalCopy(msgs).copyInto();
    },

    findUsers: async query => {
        let data = await getClient().findUsers(query, {
            onlyMembers: true
        });

        data = data.map(user => new FakeUser(user).fixedUser);
        return new ExternalCopy(data).copyInto();
    }
};

export default FakeUtil;
