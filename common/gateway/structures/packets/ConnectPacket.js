import ClientPacket from "./ClientPacket.js";

import Opcodes from "../Opcodes.js";

class ConnectPacket extends ClientPacket {
    static op = Opcodes.CONNECT;

    get heartbeatInterval() {
        return this.data.heartbeat_interval ?? 0;
    }

    handleClient(client) {
        client.handleConnectPacket(this);
    }
}

export default ConnectPacket;
