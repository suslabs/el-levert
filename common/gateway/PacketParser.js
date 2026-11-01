import PacketFactory from "./PacketFactory.js";

import TypeTester from "../util/TypeTester.js";

import PacketError from "../errors/PacketError.js";

class PacketParser {
    static parse(raw) {
        let obj;

        try {
            obj = JSON.parse(raw);
        } catch (err) {
            throw new PacketError("Invalid control packet: invalid JSON payload", raw);
        }

        if (!TypeTester.isObject(obj)) {
            throw new PacketError("Invalid control packet: payload must be an object", obj);
        } else if (typeof obj.op !== "number") {
            throw new PacketError("Invalid control packet: op must be a number", obj.op);
        }

        return PacketFactory.create(obj.op, obj.t, obj.data);
    }
}

export default PacketParser;

