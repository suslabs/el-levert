import VMUtil from "../util/VMUtil.js";

class FakeMsg {
    constructor(fixedMsg) {
        fixedMsg = fixedMsg ?? {};

        this.msg = {
            author: fixedMsg.author ?? { id: "" },
            channelId: fixedMsg.channelId ?? "",
            ...fixedMsg
        };
        this.fixedMsg = fixedMsg;
    }

    static reply(text, msg) {
        const formatted = VMUtil.formatReply(text, msg);
        return JSON.stringify(formatted);
    }
}

export default FakeMsg;
