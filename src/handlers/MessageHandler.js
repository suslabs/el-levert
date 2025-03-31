import Handler from "./Handler.js";

import MessageTracker from "./tracker/MessageTracker.js";
import UserTracker from "./tracker/UserTracker.js";

import { getLogger } from "../LevertClient.js";

class MessageHandler extends Handler {
    constructor(enabled, hasMessageTracker = true, hasUserTracker = false, options = {}) {
        super(enabled, options);

        this.hasMessageTracker = hasMessageTracker;
        this.hasUserTracker = hasUserTracker;

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

    _defaultDelete() {
        return false;
    }

    async _msgTrackerDelete(msg) {
        if (!this.hasMessageTracker) {
            return false;
        }

        let sent = this.messageTracker.deleteMsg(msg.id);

        if (typeof sent === "undefined") {
            return false;
        }

        if (Array.isArray(sent)) {
            await Promise.all(
                sent.map(msg =>
                    msg.delete().catch(err => {
                        getLogger().error(`Could not delete message ${msg.id}:`, err);
                    })
                )
            );
        } else {
            try {
                await sent.delete();
            } catch (err) {
                getLogger().error(`Could not delete message: ${sent.id}`, err);
            }
        }

        return true;
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

    async _defaultResubmit(msg) {
        if (!this.enabled) {
            return false;
        }

        await this.delete(msg);
        return await this.execute(msg);
    }
}

export default MessageHandler;
