import MessageTracker from "./tracker/MessageTracker.js";
import UserTracker from "./tracker/UserTracker.js";

import { getLogger } from "../LevertClient.js";

import HandlerError from "../errors/HandlerError.js";

class Handler {
    constructor(enabled = true, hasMessageTracker = true, hasUserTracker = false, options = {}) {
        if (typeof this.constructor.$name !== "string") {
            throw new HandlerError("Handler must have a name");
        }

        if (typeof this.execute !== "function") {
            throw new HandlerError("Child class must have an execute function");
        }

        this.enabled = enabled;

        this.hasMessageTracker = hasMessageTracker;
        this.hasUserTracker = hasUserTracker;

        this.options = options;
        this.priority ??= options.priority ?? 0;

        this._childExecute = this.execute;
        this.execute = this._execute;

        this._childDelete = this.delete;
        this.delete = this._delete;

        this._childResubmit = this.resubmit;
        this.resubmit = this._resubmit;
    }

    async reply(msg, data) {
        const reply = await msg.reply(data);
        this.messageTracker.addMsg(reply, msg.id);
    }

    load() {
        if (!this.enabled) {
            return;
        }

        if (this.hasMessageTracker) {
            this.messageTracker = new MessageTracker();
        }

        if (this.hasUserTracker) {
            const userSweepInterval = this.options.userSweepInterval ?? 0;
            this.userTracker = new UserTracker(userSweepInterval);
        }
    }

    unload() {
        if (this.hasMessageTracker) {
            this.messageTracker.clearMsgs();
        }

        if (this.hasUserTracker) {
            this.userTracker.clearUsers();
            this.userTracker._clearSweepInterval();
        }
    }

    _defaultDelete() {
        return false;
    }

    async _msgTrackerDelete(msg) {
        if (!this.hasMessageTracker) {
            return false;
        }

        const sentMsg = this.messageTracker.deleteMsg(msg.id);

        if (typeof sentMsg === "undefined") {
            return false;
        }

        if (Array.isArray(sentMsg)) {
            for (const sent of sentMsg) {
                try {
                    await sent.delete();
                } catch (err) {
                    getLogger().error("Could not delete message:", err);
                }
            }
        } else {
            try {
                await sentMsg.delete();
            } catch (err) {
                getLogger().error("Could not delete message:", err);
            }
        }

        return true;
    }

    async _defaultResubmit(msg) {
        if (!this.enabled) {
            return false;
        }

        await this.delete(msg);
        return await this.execute(msg);
    }

    _execute(msg) {
        if (!this.enabled) {
            return false;
        }

        return this._childExecute(msg);
    }

    _delete(msg) {
        if (!this.enabled) {
            return false;
        }

        let deleteFunc;

        if (typeof this._childDelete === "function") {
            deleteFunc = this._childDelete;
        } else if (this.hasMessageTracker) {
            deleteFunc = this._msgTrackerDelete;
        } else {
            deleteFunc = this._defaultDelete;
        }

        deleteFunc = deleteFunc.bind(this);
        return deleteFunc(msg);
    }

    _resubmit(msg) {
        if (!this.enabled) {
            return false;
        }

        let resubmitFunc;

        if (typeof this._childResubmit === "function") {
            resubmitFunc = this._childResubmit;
        } else {
            resubmitFunc = this._defaultResubmit;
        }

        resubmitFunc = resubmitFunc.bind(this);
        return resubmitFunc(msg);
    }
}

export default Handler;
