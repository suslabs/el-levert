import HandlerError from "../errors/HandlerError.js";

import MessageTracker from "./tracker/MessageTracker.js";
import UserTracker from "./tracker/UserTracker.js";

import { getClient, getLogger } from "../LevertClient.js";

function execute(msg) {
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

    if (typeof this.childDelete === "undefined") {
        if (this.hasMessageTracker) {
            deleteFunc = this.msgTrackerDelete;
        } else {
            deleteFunc = this.defaultDelete;
        }
    } else {
        deleteFunc = this.childDelete;
    }

    deleteFunc = deleteFunc.bind(this);
    return deleteFunc(msg);
}

class Handler {
    constructor(enabled = true, hasMessageTracker = true, hasUserTracker = false, options = {}) {
        if (typeof this.execute !== "function") {
            throw new HandlerError("Child class must have an execute function");
        }

        this.enabled = enabled;

        this.hasMessageTracker = hasMessageTracker;
        this.hasUserTracker = hasUserTracker;

        this.options = options;

        this.childExecute = this.execute;
        const executeFunc = execute.bind(this);
        this.execute = getClient().wrapEvent(executeFunc);

        this.childDelete = this.delete;
        const deleteFunc = _delete.bind(this);
        this.delete = getClient().wrapEvent(deleteFunc);
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

        if (sentMsg.constructor.name === "Array") {
            for (const sent of sentMsg) {
                try {
                    await sent.delete();
                } catch (err) {
                    getLogger().error("Could not delete message", err);
                }
            }
        } else {
            try {
                await sentMsg.delete();
            } catch (err) {
                getLogger().error("Could not delete message", err);
            }
        }

        return true;
    }

    async resubmit(msg) {
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
            const userCheckInterval = this.options.userCheckInterval ?? 0;
            this.userTracker = new UserTracker(userCheckInterval);
        }
    }

    unload() {
        if (this.hasMessageTracker) {
            this.messageTracker.clearMsgs();
        }

        if (this.hasUserTracker) {
            this.userTracker.clearUsers();
            this.userTracker.clearCheckInterval();
        }
    }
}

export default Handler;
