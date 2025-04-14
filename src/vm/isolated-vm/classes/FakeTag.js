import Util from "../../../util/Util.js";

class FakeTag {
    constructor(tag, args) {
        this.tag = tag ?? undefined;
        this.args = args?.trim();

        const fixedTag = {};

        if (!Util.empty(args)) {
            fixedTag.args = args;
        }

        if (tag != null) {
            fixedTag.body = tag.body;
            fixedTag.name = tag.name;
            fixedTag.owner = tag.owner;
        }

        this.fixedTag = fixedTag;
    }
}

export default FakeTag;
