class Tag {
    constructor(options) {
        this.hops = (options.hops || "").split(",");
        this.name = options.name || "";
        this.body = options.body || "";
        this.owner = options.owner || "0";
        this.args = options.args || "";
        this.registered = options.registered || 0;
        this.lastEdited = options.lastEdited || 0;
        this.type = options.type || 0;
    }
}

export default Tag;