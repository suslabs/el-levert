class PermissionsBitField {
    static Flags = {
        ViewChannel: "ViewChannel"
    };

    constructor(flags = []) {
        this.flags = new Set(flags);
    }

    has(flag) {
        if (this.flags.size === 0) {
            return true;
        }

        return this.flags.has(flag);
    }
}

export { PermissionsBitField };
