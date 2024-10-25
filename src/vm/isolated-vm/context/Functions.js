import FuncTypes from "../../../structures/vm/FuncTypes.js";

import FakeMsg from "../classes/FakeMsg.js";
import FakeUtil from "../classes/FakeUtil.js";
import FakeAxios from "../classes/FakeAxios.js";

import ManevraError from "../functionErrors/ManevraError.js";

const Functions = {
    msg: {
        reply: {
            type: FuncTypes.regular,
            ref: FakeMsg.reply,
            exits: true,
            errorClass: ManevraError
        }
    },

    vm: {
        getCpuTime: {
            type: FuncTypes.regular,
            ref: "vm.getCpuTime"
        },
        getWallTime: {
            type: FuncTypes.regular,
            ref: "vm.getWallTime"
        }
    },

    util: {
        findUsers: {
            type: FuncTypes.syncPromise,
            ref: FakeUtil.findUsers
        },
        fetchTag: {
            type: FuncTypes.syncPromise,
            ref: FakeUtil.fetchTag
        },
        findTags: {
            type: FuncTypes.syncPromise,
            ref: FakeUtil.findTags
        },
        dumpTags: {
            type: FuncTypes.syncPromise,
            ref: FakeUtil.dumpTags
        },
        fetchMessage: {
            type: FuncTypes.syncPromise,
            ref: FakeUtil.fetchMessage,
            binds: ["msg.msg.author.id", "msg.msg.channelId"]
        },
        fetchMessages: {
            type: FuncTypes.syncPromise,
            ref: FakeUtil.fetchMessages,
            binds: ["msg.msg.author.id", "msg.msg.channelId"]
        }
    },

    http: {
        request: {
            type: FuncTypes.syncPromise,
            ref: FakeAxios.request
        }
    }
};

export default Functions;
