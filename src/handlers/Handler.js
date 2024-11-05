import HandlerError from "../errors/HandlerError.js";

import MessageTracker from "./tracker/MessageTracker.js";
import UserTracker from "./tracker/UserTracker.js";

import { getLogger } from "../LevertClient.js";

function _execute(msg) {
    if (!this.enabled) {
        return false;
    }

    return this.childExecute(msg);
}

function _delete(msg) {
    if (!this.enabled) {
        return false;
    }

    let deleteFunc;

    if (typeof this.childDelete === "function") {
        deleteFunc = this.childDelete;
    } else if (this.hasMessageTracker) {
        deleteFunc = this.msgTrackerDelete;
    } else {
        deleteFunc = this.defaultDelete;
    }

    deleteFunc = deleteFunc.bind(this);
    return deleteFunc(msg);
}

function _resubmit(msg) {
    if (!this.enabled) {
        return false;
    }

    let resubmitFunc;

    if (typeof this.childResubmit === "function") {
        resubmitFunc = this.childResubmit;
    } else {
        resubmitFunc = this.defaultResubmit;
    }

    resubmitFunc = resubmitFunc.bind(this);
    return resubmitFunc(msg);
}

class Handler {
    constructor(enabled = true, hasMessageTracker = true, hasUserTracker = false, options = {}) {
        if (typeof this.constructor.$name === "undefined") {
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

        this.childExecute = this.execute;
        this.execute = _execute.bind(this);

        this.childDelete = this.delete;
        this.delete = _delete.bind(this);

        this.childResubmit = this.resubmit;
        this.resubmit = _resubmit.bind(this);
    }

    defaultDelete() {
        return false;
    }

    async msgTrackerDelete(msg) {
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

    async defaultResubmit(msg) {
        if (!this.enabled) {
            return false;
        }

        await this.delete(msg);
        return await this.execute(msg);
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
            this.userTracker.clearSweepInterval();
        }
    }
}

export default Handler;
