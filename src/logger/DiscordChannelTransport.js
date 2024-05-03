import * as Transport from "winston-transport";

class DiscordChannelTransport extends Transport {
    constructor(opts) {
        super(opts);

        this.channel = opts.channel;
        this.msgBuffer = [];
    }

    log(info, callback) {
        setImmediate(() => {
            this.emit("logged", info);
        });

        callback();
    }
}

export default DiscordChannelTransport;
