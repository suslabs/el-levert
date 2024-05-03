class FakeTag {
    constructor(tag, args) {
        if (tag === null) {
            tag = undefined;
        }

        if (args === null || args?.length < 1) {
            args = undefined;
        }

        this.tag = tag;
        this.args = args;

        const fixedTag = {};

        if (typeof args !== "undefined") {
            fixedTag.args = args;
        }

        if (typeof tag !== "undefined") {
            fixedTag.body = tag.body;
            fixedTag.name = tag.name;
            fixedTag.owner = tag.owner;
        }

        this.fixedTag = fixedTag;
    }
}

export default FakeTag;
