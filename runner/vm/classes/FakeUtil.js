import ivm from "isolated-vm";
const { ExternalCopy } = ivm;

import EvalContext from "../context/EvalContext.js";
import { VMErrors } from "../VMErrors.js";

import ObjectUtil from "@el-levert/common/util/ObjectUtil.js";

import VMError from "@el-levert/common/errors/VMError.js";

const FakeUtil = Object.freeze({
    getRpc: () => EvalContext.activeContext?.rpc ?? null,

    getInfo: (info = {}) => {
        const context = EvalContext.activeContext;

        return {
            version: info.version ?? "1.0.0",
            env: info.env ?? "El Levert",
            timeLimit: context?.timeLimit ?? 0,
            inspectorEnabled: context?.enableInspector ?? false,
            outCharLimit: info.outCharLimit ?? 2000,
            outLineLimit: info.outLineLimit ?? 50
        };
    },

    delay: (context, ms) => {
        ms = Math.round(ms);

        return new Promise((resolve, reject) => {
            let resolveTimer, rejectTimer;

            resolveTimer = setTimeout(() => {
                clearTimeout(rejectTimer);
                resolve();
            }, ms);

            rejectTimer = setTimeout(() => {
                clearTimeout(resolveTimer);
                reject(new VMError(VMErrors.timeout.out));
            }, context.timeRemaining);
        });
    },

    fetchTag: async (name, options) => {
        const rpc = FakeUtil.getRpc();

        if (rpc === null) {
            throw new VMError("No RPC connection available for fetchTag");
        }

        options = ObjectUtil.guaranteeObject(options, "aliasOriginal");
        const data = await rpc.call("fetchTag", name, options);

        return data !== null ? new ExternalCopy(data).copyInto() : null;
    },

    findTags: async query => {
        const rpc = FakeUtil.getRpc();

        if (rpc === null) {
            throw new VMError("No RPC connection available for findTags");
        }

        const tags = await rpc.call("findTags", query);
        return new ExternalCopy(tags).copyInto();
    },

    dumpTags: async (full = false) => {
        const rpc = FakeUtil.getRpc();

        if (rpc === null) {
            throw new VMError("No RPC connection available for dumpTags");
        }

        const tags = await rpc.call("dumpTags", full);
        return new ExternalCopy(tags).copyInto();
    },

    fetchMessage: async (user_id, default_id, ch_id, msg_id) => {
        const rpc = FakeUtil.getRpc();

        if (rpc === null) {
            throw new VMError("No RPC connection available for fetchMessage");
        }

        const msg = await rpc.call("fetchMessage", user_id, default_id, ch_id, msg_id);
        return msg !== null ? new ExternalCopy(msg).copyInto() : null;
    },

    fetchMessages: async (user_id, default_id, ch_id, fetchOptions) => {
        const rpc = FakeUtil.getRpc();

        if (rpc === null) {
            throw new VMError("No RPC connection available for fetchMessages");
        }

        const msgs = await rpc.call("fetchMessages", user_id, default_id, ch_id, fetchOptions);
        return msgs !== null ? new ExternalCopy(msgs).copyInto() : null;
    },

    findUserById: async user_id => {
        const rpc = FakeUtil.getRpc();

        if (rpc === null) {
            throw new VMError("No RPC connection available for findUserById");
        }

        const user = await rpc.call("findUserById", user_id);
        return user !== null ? new ExternalCopy(user).copyInto() : null;
    },

    findUsers: async (query, options) => {
        const rpc = FakeUtil.getRpc();

        if (rpc === null) {
            throw new VMError("No RPC connection available for findUsers");
        }

        options = ObjectUtil.guaranteeObject(options, "sv_id");
        const users = await rpc.call("findUsers", query, options);

        return new ExternalCopy(users).copyInto();
    },

    prepareExecuteTag: async (name, args) => {
        const rpc = FakeUtil.getRpc();

        if (rpc === null) {
            throw new VMError("No RPC connection available for prepareExecuteTag");
        }

        const tag = await rpc.call("prepareExecuteTag", name, args);

        return tag !== null ? new ExternalCopy(tag).copyInto() : null;
    },

    executeTagSafeRef: async (msg, name, args) => {
        const rpc = FakeUtil.getRpc();

        if (rpc === null) {
            throw new VMError("No RPC connection available for executeTagSafe");
        }

        return await rpc.call("executeTagSafe", name, args, msg);
    },

    /* eslint-disable */
    executeTag: (name, args) => {
        const options = {
            arguments: {
                copy: true
            }
        };

        const tag = $0.applySyncPromise(undefined, [name, args], options);

        if (tag === null) {
            // eslint-disable-next-line no-restricted-syntax
            throw new Error(`Tag ${name} doesn't exist`);
        } else if (!tag.isScript) {
            return tag.body;
        }

        const oldTag = globalThis.tag,
            newTag = {
                name,
                args: tag.args
            };

        try {
            globalThis.tag = newTag;
            return Function("code", "return eval(code);")(tag.body);
        } finally {
            globalThis.tag = oldTag;
        }
    },

    executeTagSafe: async (name, args) => {
        const options = {
            arguments: {
                copy: true
            }
        };

        const tag = await $0.applySyncPromise(undefined, [name, args], options);

        if (tag === null) {
            // eslint-disable-next-line no-restricted-syntax
            throw new Error(`Tag ${name} doesn't exist`);
        }

        return await $1.applySyncPromise(undefined, [name, tag.args], options);
    }
    /* eslint-enable */
});

export default FakeUtil;
