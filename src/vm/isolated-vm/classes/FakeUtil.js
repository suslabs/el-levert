import ivm from "isolated-vm";
const { ExternalCopy } = ivm;

import FakeMsg from "./FakeMsg.js";
import FakeUser from "./FakeUser.js";

import VMErrors from "../VMErrors.js";

import { getClient } from "../../../LevertClient.js";

const FakeUtil = Object.freeze({
    getInfo: _ => ({
        version: getClient().version,
        env: `El Levert ${getClient().version}`,

        timeLimit: getClient().tagVM.timeLimit,
        inspectorEnabled: getClient().tagVM.enableInspector,

        outCharLimit: getClient().tagVM.outCharLimit,
        outLineLimit: getClient().tagVM.outLineLimit
    }),

    delay: (context, ms) => {
        return new Promise((resolve, reject) => {
            let resolveTimer, rejectTimer;

            resolveTimer = setTimeout(() => {
                clearTimeout(rejectTimer);
                resolve();
            }, ms);

            rejectTimer = setTimeout(() => {
                clearTimeout(resolveTimer);
                reject(new Error(VMErrors.timeout.out));
            }, context.timeRemaining);
        });
    },

    fetchTag: async name => {
        if (getClient().tagManager.checkName(name)) {
            return null;
        }

        let tag = await getClient().tagManager.fetch(name);

        if (tag === null) {
            return null;
        }

        if (tag.isAlias) {
            const owner = tag.owner;
            tag = await getClient().tagManager.fetchAlias(tag);

            tag.setName(name);
            tag.setOwner(owner);
        }

        const data = tag.getData();
        return new ExternalCopy(data).copyInto();
    },

    findTags: async query => {
        const tags = await getClient().tagManager.search(query);
        return new ExternalCopy(tags).copyInto();
    },

    dumpTags: async (full = false) => {
        let tags = await getClient().tagManager.dump(full);

        if (full) {
            tags = tags.map(tag => tag.getData());
        }

        return new ExternalCopy(tags).copyInto();
    },

    fetchMessage: async (user_id, default_id, ch_id, msg_id) => {
        if (ch_id == null) {
            ch_id = default_id;
        }

        let msg = await getClient().fetchMessage(ch_id, msg_id, {
            user_id,
            checkAccess: true
        });

        if (msg === null) {
            return null;
        }

        msg = new FakeMsg(msg).fixedMsg;
        return new ExternalCopy(msg).copyInto();
    },

    fetchMessages: async (user_id, default_id, ch_id, fetchOptions) => {
        if (ch_id == null) {
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

        if (msgs === null) {
            const msg_id = ch_id,
                msg = await getClient().fetchMessage(default_id, msg_id, {
                    user_id,
                    checkAccess: true
                });

            if (msg === null) {
                return null;
            }

            msgs = [msg];
        }

        msgs = msgs.map(msg => new FakeMsg(msg).fixedMsg);
        return new ExternalCopy(msgs).copyInto();
    },

    findUserById: async user_id => {
        let user = await getClient().findUserById(user_id);

        user = new FakeUser(user).fixedUser;
        return new ExternalCopy(user).copyInto();
    },

    findUsers: async query => {
        let users = await getClient().findUsers(query, {
            onlyMembers: true
        });

        users = users.map(user => new FakeUser(user).fixedUser);
        return new ExternalCopy(users).copyInto();
    },

    /* eslint-disable */
    executeTag: (name, args) => {
        const tag = $0.applySyncPromise(undefined, [name]);

        if (tag === null) {
            throw new Error(`Tag ${name} doesn't exist`);
        } else if ((tag.type & 2) === 0) {
            return tag.body;
        }

        let evalArgs = tag.args;

        if (args != null) {
            args = Array.isArray(args) ? args.join(" ") : String(args);
            evalArgs = args + " " + evalArgs;
        }

        const oldTag = globalThis.tag,
            newTag = {
                name,
                args: evalArgs.length < 1 ? undefined : evalArgs
            };

        try {
            globalThis.tag = newTag;
            return Function("code", "return eval(code);")(tag.body);
        } finally {
            globalThis.tag = oldTag;
        }
    }
    /* eslint-enable */
});

export default FakeUtil;
