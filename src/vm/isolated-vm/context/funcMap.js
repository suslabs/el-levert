import FuncTypes from "../../../structures/vm/FuncTypes.js";

import FakeUtil from "../classes/FakeUtil.js";
import FakeAxios from "../classes/FakeAxios.js";

import ManevraError from "../functionErrors/ManevraError.js";

const funcMap = {
    msg: {
        reply: {
            type: FuncTypes.regular,
            ref: "msg.reply",
            exits: true,
            errorClass: ManevraError
        }
    },
    util: {
        findUsers: {
            type: FuncTypes.syncPromise,
            ref: FakeUtil.findUsers
        },
        dumpTags: {
            type: FuncTypes.syncPromise,
            ref: FakeUtil.dumpTags
        },
        fetchTag: {
            type: FuncTypes.syncPromise,
            ref: FakeUtil.fetchTag
        },
        fetchMessage: {
            type: FuncTypes.syncPromise,
            ref: FakeUtil.fetchMessage,
            binds: [null, "msg.msg.author.id"]
        },
        fetchMessages: {
            type: FuncTypes.syncPromise,
            ref: FakeUtil.fetchMessages,
            binds: [null, "msg.msg.author.id"]
        }
    },
    http: {
        request: {
            type: FuncTypes.syncPromise,
            ref: FakeAxios.request
        }
    }
};

export default funcMap;
