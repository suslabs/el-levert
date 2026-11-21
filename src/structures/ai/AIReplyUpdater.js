import Util from "../../util/Util.js";

class AIReplyUpdater {
    static minInterval = 1.5 / Util.durationSeconds.milli;

    constructor(ctx) {
        this.ctx = ctx;

        this.lastUpdate = 0;
        this.queue = Promise.resolve();
    }

    async start(payload) {
        this.lastUpdate = Date.now();

        if (this.ctx.isInteraction) {
            await this.ctx.deferReply();
        }

        return await this._send(payload, true);
    }

    update(payload) {
        if (Util.timeDelta(Date.now(), this.lastUpdate) < AIReplyUpdater.minInterval) {
            return this.queue;
        }

        this.lastUpdate = Date.now();
        this.queue = this.queue.then(() => this._send(payload, false));

        return this.queue;
    }

    async finish(payload) {
        await this.queue;
        return await this._send(payload, false);
    }

    async _send(payload, initial) {
        if (initial || this.ctx.isInteraction) {
            return await this.ctx.reply(payload);
        }

        return await this.ctx.edit(payload);
    }
}

export default AIReplyUpdater;
