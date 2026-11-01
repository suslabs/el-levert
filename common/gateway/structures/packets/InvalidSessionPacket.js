import ClientPacket from "./ClientPacket.js";

import Opcodes from "../Opcodes.js";

class InvalidSessionPacket extends ClientPacket {
    static op = Opcodes.INVALID_SESSION;

    get message() {
        return this.data.message ?? "";
    }

    handleClient(client) {
        client.handleInvalidSessionPacket(this);
    }
}

export default InvalidSessionPacket;
