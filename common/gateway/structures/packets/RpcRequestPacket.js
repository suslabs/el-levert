import Opcodes from "../Opcodes.js";
import Packet from "./Packet.js";

class RpcRequestPacket extends Packet {
    static op = Opcodes.RPC_REQUEST;

    constructor(eventName, data) {
        super(eventName, data);
    }

    get callId() {
        return this.data.id;
    }

    get method() {
        return this.data.method;
    }

    get args() {
        return this.data.args ?? [];
    }
}

export default RpcRequestPacket;

