import Util from "../../../util/Util.js";

class FakeTag {
    constructor(tag, args) {
        if (Util.empty(args)) {
            args = undefined;
        }

        this.tag = tag ?? undefined;
        this.args = args;

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
