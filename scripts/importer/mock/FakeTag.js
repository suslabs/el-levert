import original from "../../../src/structures/tag/Tag.js";

class Tag extends original {
    setNew() {
        return Tag._fetchFinished ? this.type : super.setNew();
    }

    setRegistered(time) {
        return this.registered;
    }

    setLastEdited(time) {
        return this.lastEdited;
    }

    static _fetchFinished = false;
}

export default Tag;
