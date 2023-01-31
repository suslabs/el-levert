class TagError extends Error {
    constructor(message = "", ref, ...args) {
        super(message, ...args);
        
        this.name = "TagError";
        this.message = message;

        if(typeof ref !== "undefined") {
            this.ref = ref;
        }
    }
}

export default TagError;