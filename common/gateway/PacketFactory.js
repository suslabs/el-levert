import PacketClasses from "./structures/PacketClasses.js";

import PacketError from "../errors/PacketError.js";

class PacketFactory {
    static create(op, eventName = null, data = null) {
        const _class = PacketClasses.get(op);

        if (typeof _class === "undefined") {
            throw new PacketError(`Unknown opcode: ${op}`, op);
        }

        return new _class(eventName, data);
    }
}

export default PacketFactory;

