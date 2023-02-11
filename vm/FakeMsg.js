import Util from "../util/Util.js";

class FakeMsg {
    constructor(msg) {
        this.msg = msg;
        this.fixedMsg = Util.removeCircRef(msg);
    }

    reply(text, options) {
        return JSON.stringify(Util.formatReply(text, options));
    }
}

export default FakeMsg;