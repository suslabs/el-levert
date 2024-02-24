import Util from "../util/Util.js";

const defaultValues = {
    hops: "",
    name: "",
    body: "",
    owner: "0",
    args: "",
    registered: 0,
    lastEdited: 0,
    type: 0
};

class Tag {
    constructor(options) {
        Object.assign(this, {
            ...defaultValues,
            ...options
        });

        this.hops = this.hops.split(",");
    }

    getHopsString() {
        return this.hops.join(",");
    }

    getSize() {
        const bodySize = Util.getByteLen(this.body),
            argsSize = Util.getByteLen(this.args);

        const totalSize = bodySize + argsSize;
        return totalSize / 1024;
    }
}

export default Tag;
