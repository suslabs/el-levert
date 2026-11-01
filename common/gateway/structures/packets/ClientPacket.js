import Packet from "./Packet.js";

import PacketError from "../../../errors/PacketError.js";

class ClientPacket extends Packet {
    constructor(...args) {
        super(...args);

        if (Object.hasOwn(this.constructor.prototype, "handleServer")) {
            throw new PacketError(`${this.constructor.name} cannot define handleServer().`, this.constructor);
        }
    }
}

export default ClientPacket;
