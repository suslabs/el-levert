class BaseCommandContext {
    constructor(data = {}) {
        this.options = data.options ?? {};

        this.command = data.command ?? null;
        this.commandName = data.commandName ?? data.parseResult?.name ?? "";

        this.raw = data.raw ?? data.rawContent ?? "";
        this.rawContent = data.rawContent ?? this.raw;

        this.argsText = data.argsText ?? "";
        this.parseResult = data.parseResult ?? null;

        this.isEdit = data.isEdit ?? false;
        this.replied = data.replied ?? false;
        this.processingReplySent = data.processingReplySent ?? false;

        for (const [key, value] of Object.entries(data)) {
            if (!(key in this)) {
                this[key] = value;
            }
        }
    }

    clone(overrides = {}) {
        return new this.constructor({
            ...this,
            ...overrides
        });
    }

    withArgs(argsText, overrides = {}) {
        return this.clone({
            ...overrides,
            argsText
        });
    }

    markReplied() {
        this.replied = true;
        return this;
    }
}

export default BaseCommandContext;
