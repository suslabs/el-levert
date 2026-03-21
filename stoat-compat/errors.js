class DiscordAPIError extends Error {
    constructor(message, code = null) {
        super(message);
        this.name = "DiscordAPIError";
        this.code = code;
    }
}

export { DiscordAPIError };
