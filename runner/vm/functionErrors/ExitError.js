class ExitError extends Error {
    constructor(exitData) {
        super("Exit VM");

        this.name = this.constructor.name;
        this.exitData = exitData;
    }
}

export default ExitError;
