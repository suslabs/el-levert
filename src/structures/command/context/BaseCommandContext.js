import ObjectUtil from "../../../util/ObjectUtil.js";

class BaseCommandContext {
    constructor(data) {
        data = ObjectUtil.guaranteeObject(data);
        this.data = data;

        this.options = data.options ?? {};

        this.command = data.command ?? null;
        this.commandName = data.commandName ?? data.parseResult?.name ?? "";

        this.raw = data.raw ?? data.rawContent ?? "";
        this.rawContent = data.rawContent ?? this.raw;

        this.argsText = data.argsText ?? "";
        this.parseResult = data.parseResult ?? null;

        this.isEdit = data.isEdit ?? false;

        this.replied = false;
        this.processingReplySent = false;
        this.timeoutDisabled = false;

        for (const [key, value] of Object.entries(data)) {
            if (!(key in this)) {
                this[key] = value;
            }
        }

        this._disableTimeoutHook = null;
    }

    clone(overrides) {
        overrides = ObjectUtil.guaranteeObject(overrides);

        const context = new this.constructor({
            ...this,
            ...overrides
        });

        context.replied = this.replied;
        context.processingReplySent = this.processingReplySent;
        context.timeoutDisabled = this.timeoutDisabled;
        context._disableTimeoutHook = this._disableTimeoutHook;

        return context;
    }

    withArgs(argsText, overrides) {
        overrides = ObjectUtil.guaranteeObject(overrides);

        return this.clone({
            ...overrides,
            argsText
        });
    }

    markReplied() {
        this.replied = true;
        return this;
    }

    setDisableTimeoutHook(hook = null) {
        this._disableTimeoutHook = typeof hook === "function" ? hook : null;
        return this;
    }

    disableTimeout() {
        if (this.timeoutDisabled) {
            return this;
        }

        this.timeoutDisabled = true;
        this._disableTimeoutHook?.();

        return this;
    }
}

export default BaseCommandContext;
