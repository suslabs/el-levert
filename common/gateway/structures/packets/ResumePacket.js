import ClientIdPacket from "./ClientIdPacket.js";

import Opcodes from "../Opcodes.js";

class ResumePacket extends ClientIdPacket {
    static op = Opcodes.RESUME;

    get sessionId() {
        return this.data.sessionId ?? null;
    }

    handleServer(manager, socket) {
        manager.handleResume(socket, this.clientId, this.sessionId);
    }
}

export default ResumePacket;
