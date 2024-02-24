function load(...args) {
    if (!this.enabled) {
        return;
    }

    return this.childLoad(...args);
}

class Manager {
    constructor(enabled) {
        this.enabled = enabled;

        if (typeof this.load !== "function") {
            throw new Error("Child class must have a load function");
        }

        this.childLoad = this.load;
        this.load = load.bind(this);
    }
}

export default Manager;
