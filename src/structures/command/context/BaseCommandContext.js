import BaseStructure from "../../BaseStructure.js";

import Util from "../../../util/Util.js";
import ObjectUtil from "../../../util/ObjectUtil.js";

class BaseCommandContext extends BaseStructure {
    static defaultValues = {
        options: {},
        command: null,
        commandName: "",
        raw: "",
        argsText: "",
        parseResult: null,
        replied: false,
        timeoutDisabled: false
    };

    static dataProps = [
        "options",
        "command",
        "commandName",
        "raw",
        "argsText",
        "parseResult",
        "replied",
        "timeoutDisabled"
    ];

    constructor(data) {
        super(data);

        data = ObjectUtil.guaranteeObject(data);
        this.data = data;

        if (Util.empty(this.commandName) && this.parseResult?.name) {
            this.commandName = this.parseResult.name;
        }

        this._parentContext = data._parentContext ?? null;
        this._disableTimeoutHook = null;
    }

    get isInteraction() {
        return false;
    }

    _clone(overrides) {
        overrides = ObjectUtil.guaranteeObject(overrides);

        const context = new this.constructor({
            ...this,
            ...overrides,
            _parentContext: this
        });

        context._parentContext = this;
        context.replied = overrides.replied ?? this.replied;
        context.timeoutDisabled = overrides.timeoutDisabled ?? this.timeoutDisabled;
        context._disableTimeoutHook = this._disableTimeoutHook;

        if (typeof this._childClone === "function") {
            return this._childClone.call(this, context, overrides) ?? context;
        }

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
