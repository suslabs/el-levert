import { describe, expect, test, vi } from "vitest";

import InspectorPacketParser from "../../../../src/vm/isolated-vm/inspector/InspectorPacketParser.js";

function createParser() {
    const session = {
        clearActionTimeout: vi.fn(),
        resetActionTimeout: vi.fn(),
        startActionTimeout: vi.fn()
    };

    return {
        parser: new InspectorPacketParser(session),
        session
    };
}

describe("InspectorPacketParser", () => {
    test("resets the action timeout only for execution control packets", () => {
        const { parser, session } = createParser();

        expect(parser.parseIncoming('{"id":1,"method":"Debugger.stepOver"}')).toBe(true);
        expect(parser.parseIncoming('{"id":2,"method":"Debugger.resume"}')).toBe(true);
        expect(parser.parseIncoming('{"id":3,"method":"Debugger.enable"}')).toBe(true);
        expect(parser.parseIncoming('{"id":4,"method":"Runtime.evaluate"}')).toBe(true);

        expect(session.resetActionTimeout).toHaveBeenCalledTimes(2);
    });

    test("arms and clears the action timeout from backend pause notifications", () => {
        const { parser, session } = createParser();

        expect(parser.parseOutgoing('{"method":"Debugger.paused","params":{}}')).toBe(true);
        expect(parser.parseOutgoing(Buffer.from('{"method":"Debugger.resumed"}'))).toBe(true);

        expect(session.startActionTimeout).toHaveBeenCalledOnce();
        expect(session.clearActionTimeout).toHaveBeenCalledOnce();
    });

    test("rejects malformed packets but tolerates responses and unknown methods", () => {
        const { parser, session } = createParser();

        expect(parser.parseIncoming("not-json")).toBe(false);
        expect(parser.parseIncoming('{"id":1,"result":{}}')).toBe(true);
        expect(parser.parseOutgoing('{"method":"Debugger.scriptParsed","params":{}}')).toBe(true);

        expect(session.resetActionTimeout).not.toHaveBeenCalled();
        expect(session.startActionTimeout).not.toHaveBeenCalled();
        expect(session.clearActionTimeout).not.toHaveBeenCalled();
    });
});
