import Util from "../../util/Util.js";

class AIReplyUpdater {
    static minInterval = 1.5 / Util.durationSeconds.milli;

    constructor(ctx, replace = false) {
        this.ctx = ctx;
        this.replace = replace;

        this.lastUpdate = 0;
        this.queue = Promise.resolve();

        this.pending = null;
        this.timer = null;

        this.closed = false;
    }

    async start(payload) {
        await (this.replace ? this.ctx.deferUpdate() : this.ctx.deferReply());

        this.lastUpdate = Date.now();
        return await this.ctx.reply(payload);
    }

    update(payload) {
        if (this.closed) {
            return;
        }

        this.pending = payload;

        if (this.timer !== null) {
            return;
        }

        const elapsed = Util.timeDelta(Date.now(), this.lastUpdate),
            delay = Math.max(AIReplyUpdater.minInterval - elapsed, 0);

        this.timer = setTimeout(() => this._flush(), delay);
    }

    cancel() {
        clearTimeout(this.timer);

        this.timer = null;
        this.pending = null;
    }

    async close() {
        this.closed = true;
        this.cancel();

        await this.queue;
    }

    async finish(payload) {
        this.cancel();
        await this.queue;

        return await this._edit(payload);
    }

    _flush() {
        const payload = this.pending;

        this.timer = null;
        this.pending = null;

        this.lastUpdate = Date.now();
        this.queue = this.queue.then(() => this._edit(payload));
    }

    async _edit(payload) {
        return await (this.ctx.isInteraction ? this.ctx.reply(payload) : this.ctx.edit(payload));
    }
}

export default AIReplyUpdater;
