class ConfigError extends Error {
    constructor(message = "", ...args) {
        super(message, ...args);

        this.name = "ConfigError";
        this.message = message;
    }
}

export default ConfigError;
