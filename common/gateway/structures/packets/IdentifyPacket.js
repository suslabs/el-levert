import ClientIdPacket from "./ClientIdPacket.js";

import Opcodes from "../Opcodes.js";

class IdentifyPacket extends ClientIdPacket {
    static op = Opcodes.IDENTIFY;

    handleServer(manager, socket) {
        manager.handleIdentify(socket, this.clientId);
    }
}

export default IdentifyPacket;
