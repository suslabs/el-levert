import Util from "../../../util/Util.js";

class FakeTag {
    constructor(tag, args) {
        this.tag = tag ?? undefined;
        this.args = args?.trim();

        const fixedTag = {};

        if (!Util.empty(this.args)) {
            fixedTag.args = this.args;
        }

        if (typeof this.tag !== "undefined") {
            fixedTag.body = this.tag.body;
            fixedTag.name = this.tag.name;
            fixedTag.owner = this.tag.owner;
        }

        this.fixedTag = fixedTag;
    }
}

export default FakeTag;
