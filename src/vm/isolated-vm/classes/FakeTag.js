import Util from "../../../util/Util.js";

class FakeTag {
    constructor(tag, args) {
        this.tag = tag ?? undefined;
        args = args?.trim();

        if (Util.empty(args)) {
            this.args = undefined;
        } else {
            this.args = args;
        }

        const fixedTag = {};

        if (args != null) {
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
