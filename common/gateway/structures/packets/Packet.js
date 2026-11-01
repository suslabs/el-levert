import Util from "../../../util/Util.js";
import ObjectUtil from "../../../util/ObjectUtil.js";
import PacketError from "../../../errors/PacketError.js";

class Packet {
    constructor(eventName, data) {
        this.eventName = eventName ?? "";
        this.data = ObjectUtil.guaranteeObject(data);
    }

    get op() {
        const op = this.constructor.op;

        if (typeof op !== "number") {
            throw new PacketError(`${this.constructor.name} must define an op number.`);
        }

        return op;
    }

    handleServer(manager, socket) {}

    handleClient(client) {}

    serialize() {
        const payload = {
            op: this.op,
            data: this.data
        };

        if (!Util.empty(this.eventName)) {
            payload.t = this.eventName;
        }

        return JSON.stringify(payload);
    }
}

export default Packet;
