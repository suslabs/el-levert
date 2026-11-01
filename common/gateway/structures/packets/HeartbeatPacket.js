import ServerPacket from "./ServerPacket.js";

import Opcodes from "../Opcodes.js";

class HeartbeatPacket extends ServerPacket {
    static op = Opcodes.HEARTBEAT;

    handleServer(manager, socket) {
        manager.handleHeartbeat(socket);
    }
}

export default HeartbeatPacket;
