import Opcodes from "../Opcodes.js";
import Packet from "./Packet.js";

class RpcResponsePacket extends Packet {
    static op = Opcodes.RPC_RESPONSE;

    constructor(eventName, data) {
        super(eventName, data);
    }

    get callId() {
        return this.data.id;
    }

    get ok() {
        return this.data.ok ?? true;
    }

    get result() {
        return this.data.result;
    }

    get error() {
        return this.data.error;
    }
}

export default RpcResponsePacket;

