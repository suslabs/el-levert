class Tag {
    constructor(options) {
        Object.assign(this, {
            hops: "",
            name: "",
            body: "",
            owner: "0",
            args: "",
            registered: 0,
            lastEdited: 0,
            type: 0,
            ...options
        });

        this.hops = this.hops.split(",");
    }
}

export default Tag;
