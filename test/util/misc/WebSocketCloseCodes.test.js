import { describe, expect, test } from "vitest";

import {
    closeCodes,
    createCloseCodeRegistry,
    getCloseCode,
    getCloseCodeInfo,
    getCloseName,
    getCloseReason,
    isApplicationCloseCode,
    isLibraryCloseCode,
    isReservedCloseCode,
    isStandardCloseCode,
    otherWsCloseCodeInfo,
    standardWsCloseCodeInfo,
    wsCloseCodeInfo,
    wsCloseCodes
} from "../../../src/util/misc/WebsocketCloseCodes.js";

describe("WebsocketCloseCodes", () => {
    test("separates base and other codes and coalesces them into wsCloseCodeInfo", () => {
        expect(standardWsCloseCodeInfo[1000]).toBeDefined();
        expect(standardWsCloseCodeInfo[4008]).toBeUndefined();

        expect(otherWsCloseCodeInfo[4008]).toBeDefined();
        expect(otherWsCloseCodeInfo[1000]).toBeUndefined();

        expect(wsCloseCodeInfo[1000]).toBeDefined();
        expect(wsCloseCodeInfo[4008]).toBeDefined();
        expect(Object.isFrozen(standardWsCloseCodeInfo)).toBe(true);
        expect(Object.isFrozen(otherWsCloseCodeInfo)).toBe(true);
        expect(Object.isFrozen(wsCloseCodeInfo)).toBe(true);
    });

    test("maps websocket close codes to readable reasons", () => {
        expect(getCloseReason(1000)).toBe("Normal Closure");
        expect(getCloseReason(3000)).toBe("Unauthorized");
        expect(getCloseReason(4008)).toBe("Rate Limited");
        expect(getCloseReason(4321)).toBe("Private Use");
    });

    test("maps websocket close names back to codes", () => {
        expect(getCloseCode("NORMAL_CLOSURE")).toBe(1000);
        expect(getCloseCode("NOT_AUTHENTICATED")).toBe(4003);
        expect(getCloseCode("RATE_LIMITED")).toBe(4008);
        expect(getCloseCode("NON_EXISTENT")).toBeNull();
        expect(wsCloseCodes.INTERNAL_ERROR).toBe(1011);
        expect(wsCloseCodes.SESSION_TIMEOUT).toBe(4009);
        expect(closeCodes.RATE_LIMITED).toBe(4008);
    });

    test("maps websocket close codes to symbolic names", () => {
        expect(getCloseName(1002)).toBe("PROTOCOL_ERROR");
        expect(getCloseName(4001)).toBe("UNKNOWN_OPCODE");
        expect(getCloseName(4008)).toBe("RATE_LIMITED");
        expect(getCloseName(4321)).toBe("PRIVATE_USE");
        expect(getCloseName(4999)).toBe("PRIVATE_USE");
    });

    test("returns websocket close info for registered and ranged codes", () => {
        expect(getCloseCodeInfo(1014)).toEqual({
            name: "BAD_GATEWAY",
            reason: "Bad Gateway"
        });

        expect(getCloseCodeInfo(4008)).toEqual({
            name: "RATE_LIMITED",
            reason: "Rate Limited"
        });

        expect(getCloseCodeInfo(3001)).toEqual({
            name: "UNASSIGNED_REGISTERABLE",
            reason: "Unassigned Registerable Close Code"
        });

        expect(getCloseCodeInfo(1020)).toEqual({
            name: "UNASSIGNED_FUTURE_STANDARD",
            reason: "For Future Standard Use"
        });
    });

    test("checks close code categories correctly", () => {
        expect(isReservedCloseCode(0)).toBe(true);
        expect(isReservedCloseCode(999)).toBe(true);
        expect(isReservedCloseCode(1000)).toBe(false);

        expect(isStandardCloseCode(1000)).toBe(true);
        expect(isStandardCloseCode(2999)).toBe(true);
        expect(isStandardCloseCode(3000)).toBe(false);

        expect(isLibraryCloseCode(3000)).toBe(true);
        expect(isLibraryCloseCode(3999)).toBe(true);
        expect(isLibraryCloseCode(4000)).toBe(false);

        expect(isApplicationCloseCode(4000)).toBe(true);
        expect(isApplicationCloseCode(4999)).toBe(true);
        expect(isApplicationCloseCode(5000)).toBe(false);
    });

    test("extends websocket close code helpers for custom codes", () => {
        const registry = createCloseCodeRegistry({
            4888: {
                name: "CUSTOM_ERROR",
                reason: "Custom Error"
            }
        });

        expect(standardWsCloseCodeInfo[4888]).toBeUndefined();
        expect(otherWsCloseCodeInfo[4888]).toBeUndefined();
        expect(registry.getCloseCode("CUSTOM_ERROR")).toBe(4888);
        expect(registry.getCloseReason(4888)).toBe("Custom Error");
        expect(registry.closeCodes.NOT_AUTHENTICATED).toBe(4003);
        expect(registry.closeCodes.RATE_LIMITED).toBe(4008);
        expect(registry.getCloseCodeInfo(4009)).toEqual({
            name: "SESSION_TIMEOUT",
            reason: "Session Timeout"
        });
    });
});
