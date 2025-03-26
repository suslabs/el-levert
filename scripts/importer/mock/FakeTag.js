import original from "../../../src/structures/tag/Tag.js";

class Tag extends original {
    static fetchFinished = false;

    setNew() {
        if (Tag.fetchFinished) {
            return this.type;
        } else {
            return super.setNew();
        }
    }

    setRegistered(time) {
        return this.registered;
    }

    setLastEdited(time) {
        return this.lastEdited;
    }
}

export default Tag;
