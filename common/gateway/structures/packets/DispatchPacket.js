import ClientPacket from "./ClientPacket.js";

import Opcodes from "../Opcodes.js";

class DispatchPacket extends ClientPacket {
    static op = Opcodes.DISPATCH;

    get clientId() {
        return this.data.clientId ?? null;
    }

    get sessionId() {
        return this.data.sessionId ?? null;
    }

    handleClient(client) {
        client.handleDispatchPacket(this);
    }
}

export default DispatchPacket;
