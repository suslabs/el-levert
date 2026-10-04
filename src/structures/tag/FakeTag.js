import Tag from "./Tag.js";

import ObjectUtil from "../../util/ObjectUtil.js";

import TagError from "../../errors/TagError.js";

class FakeTag extends Tag {
    constructor(data = {}) {
        data = ObjectUtil.guaranteeObject(data);

        super(data);

        this.execute = data.execute ?? null;
        this.isFake = true;
    }

    async run(args, values, options) {
        if (typeof this.execute !== "function") {
            throw new TagError("Cannot execute tag", this.name);
        }

        return await this.execute(this, args, values, options);
    }
}

export default FakeTag;
