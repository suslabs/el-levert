import ServerPacket from "./ServerPacket.js";

class ClientIdPacket extends ServerPacket {
    get clientId() {
        return this.data.clientId ?? null;
    }
}

export default ClientIdPacket;
