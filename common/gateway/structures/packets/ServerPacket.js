import Packet from "./Packet.js";

import PacketError from "../../../errors/PacketError.js";

class ServerPacket extends Packet {
    constructor(...args) {
        super(...args);

        if (Object.hasOwn(this.constructor.prototype, "handleClient")) {
            throw new PacketError(`${this.constructor.name} cannot define handleClient().`, this.constructor);
        }
    }
}

export default ServerPacket;
