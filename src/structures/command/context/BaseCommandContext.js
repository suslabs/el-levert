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

        this.replied = data.replied ?? false;
        this.processingReplySent = data.processingReplySent ?? false;
        this.timeoutDisabled = data.timeoutDisabled ?? false;

        this._parentContext = data._parentContext ?? null;

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
            ...overrides,
            _parentContext: this
        });

        context._parentContext = this;
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
        this._parentContext?.markReplied();

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
