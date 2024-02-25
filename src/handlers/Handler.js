import MessageTracker from "./tracker/MessageTracker.js";
import UserTracker from "./tracker/UserTracker.js";

import { getLogger } from "../LevertClient.js";

class Handler {
    constructor(enabled = true, hasMessageTracker = true, hasUserTracker = false, options = {}) {
        this.enabled = enabled;
        this.hasMessageTracker = hasMessageTracker;
        this.hasUserTracker = hasUserTracker;

        if (!enabled) {
            return;
        }

        if (hasMessageTracker) {
            this.messageTracker = new MessageTracker();
        }

        if (hasUserTracker) {
            const userCheckInterval = options.userCheckInterval ?? 0;
            this.userTracker = new UserTracker(userCheckInterval);
        }
    }

    async delete(msg) {
        if (!this.hasMessageTracker) {
            return true;
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
        return this.execute(msg);
    }
}

export default Handler;
