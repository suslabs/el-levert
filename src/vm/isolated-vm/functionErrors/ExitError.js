class ExitError extends Error {
    constructor(exitData) {
        super("Exit VM");

        this.name = "ExitError";
        this.exitData = exitData;
    }
}

export default ExitError;
