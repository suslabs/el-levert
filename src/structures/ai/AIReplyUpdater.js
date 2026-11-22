import Util from "../../util/Util.js";

class AIReplyUpdater {
    static minInterval = 1.5 / Util.durationSeconds.milli;

    constructor(target) {
        this.target = target;

        this.lastUpdate = 0;
        this.queue = Promise.resolve();

        this.pending = null;
        this.timer = null;
    }

    async start(payload) {
        this.lastUpdate = Date.now();
        return await this.target.reply(payload);
    }

    update(payload) {
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

    async finish(payload) {
        this.cancel();
        await this.queue;

        return await this.target.edit(payload);
    }

    _flush() {
        const payload = this.pending;

        this.timer = null;
        this.pending = null;

        this.lastUpdate = Date.now();
        this.queue = this.queue.then(() => this.target.edit(payload));
    }
}

export default AIReplyUpdater;
