import ClientPacket from "./ClientPacket.js";

import Opcodes from "../Opcodes.js";

class HeartbeatAckPacket extends ClientPacket {
    static op = Opcodes.HEARTBEAT_ACK;

    handleClient(client) {
        client.handleHeartbeatAckPacket(this);
    }
}

export default HeartbeatAckPacket;
