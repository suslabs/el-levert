import { describe, expect, test } from "vitest";

import PacketParser from "@el-levert/common/gateway/PacketParser.js";

import PacketError from "@el-levert/common/errors/PacketError.js";

import Opcodes from "@el-levert/common/gateway/structures/Opcodes.js";
import Packet from "@el-levert/common/gateway/structures/packets/Packet.js";
import ClientPacket from "@el-levert/common/gateway/structures/packets/ClientPacket.js";
import IdentifyPacket from "@el-levert/common/gateway/structures/packets/IdentifyPacket.js";
import ServerPacket from "@el-levert/common/gateway/structures/packets/ServerPacket.js";

describe("gateway packets", () => {
    test("guards packet data to an object", () => {
        const packet = new IdentifyPacket(null, null);

        expect(packet.data).toEqual({});
    });

    test("parses control packet data as an object", () => {
        const packet = PacketParser.parse(
            JSON.stringify({
                op: Opcodes.IDENTIFY,
                data: null
            })
        );

        expect(packet.data).toEqual({});
    });

    test("rejects invalid control packet JSON", () => {
        try {
            PacketParser.parse("{");
        } catch (err) {
            expect(err).toBeInstanceOf(PacketError);
            expect(err.ref).toBe("{");
            return;
        }

        throw new Error("Expected PacketParser.parse to throw PacketError");
    });

    test("rejects non-object control packet payloads", () => {
        try {
            PacketParser.parse("1");
        } catch (err) {
            expect(err).toBeInstanceOf(PacketError);
            expect(err.ref).toBe(1);
            return;
        }

        throw new Error("Expected PacketParser.parse to throw PacketError");
    });

    test("rejects control packets without a numeric opcode", () => {
        try {
            PacketParser.parse(JSON.stringify({ op: "1" }));
        } catch (err) {
            expect(err).toBeInstanceOf(PacketError);
            expect(err.ref).toBe("1");
            return;
        }

        throw new Error("Expected PacketParser.parse to throw PacketError");
    });

    test("rejects unknown opcodes with a packet error", () => {
        try {
            PacketParser.parse(JSON.stringify({ op: 999999 }));
        } catch (err) {
            expect(err).toBeInstanceOf(PacketError);
            expect(err.ref).toBe(999999);
            return;
        }

        throw new Error("Expected PacketParser.parse to throw PacketError");
    });

    test("requires packet classes to define a static opcode", () => {
        class MissingOpPacket extends Packet {}

        expect(() => new MissingOpPacket().serialize()).toThrow(PacketError);
    });

    test("rejects server packets that declare a client handler", () => {
        class InvalidServerPacket extends ServerPacket {
            static op = Opcodes.IDENTIFY;

            handleClient() {}
        }

        try {
            new InvalidServerPacket();
        } catch (err) {
            expect(err).toBeInstanceOf(PacketError);
            expect(err.ref).toBe(InvalidServerPacket);
            return;
        }

        throw new Error("Expected InvalidServerPacket to throw PacketError");
    });

    test("allows client packets to inherit the base handleServer stub", () => {
        class ValidClientPacket extends ClientPacket {
            static op = Opcodes.CONNECT;

            handleClient() {}
        }

        expect(() => new ValidClientPacket()).not.toThrow();
    });

    test("rejects client packets that declare a server handler", () => {
        class InvalidClientPacket extends ClientPacket {
            static op = Opcodes.CONNECT;

            handleServer() {}
        }

        try {
            new InvalidClientPacket();
        } catch (err) {
            expect(err).toBeInstanceOf(PacketError);
            expect(err.ref).toBe(InvalidClientPacket);
            return;
        }

        throw new Error("Expected InvalidClientPacket to throw PacketError");
    });

    test("allows server packets to inherit the base handleClient stub", () => {
        class ValidServerPacket extends ServerPacket {
            static op = Opcodes.IDENTIFY;

            handleServer() {}
        }

        expect(() => new ValidServerPacket()).not.toThrow();
    });
});
