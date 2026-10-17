import { describe, expect, test } from "vitest";

import {
    getHttpStatusCode,
    getHttpStatusCodeInfo,
    getHttpStatusName,
    getHttpStatusText,
    httpStatusCodeInfo,
    httpStatusCodes,
    isClientErrorStatus,
    isErrorStatus,
    isInformationalStatus,
    isRedirectStatus,
    isServerErrorStatus,
    isSuccessStatus
} from "../../../src/util/misc/HttpStatusCodes.js";

describe("HttpStatusCodes", () => {
    test("maps status codes to names and text", () => {
        expect(httpStatusCodes.OK).toBe(200);
        expect(httpStatusCodes.NOT_FOUND).toBe(404);
        expect(httpStatusCodes.PAYLOAD_TOO_LARGE).toBe(413);
        expect(httpStatusCodes.TOO_MANY_REQUESTS).toBe(429);
        expect(httpStatusCodes.INTERNAL_SERVER_ERROR).toBe(500);

        expect(getHttpStatusText(200)).toBe("OK");
        expect(getHttpStatusText(404)).toBe("Not Found");
        expect(getHttpStatusText(413)).toBe("Payload Too Large");
        expect(getHttpStatusText(429)).toBe("Too Many Requests");
        expect(getHttpStatusText(999)).toBe("Unknown Status");

        expect(getHttpStatusName(200)).toBe("OK");
        expect(getHttpStatusName(404)).toBe("NOT_FOUND");
        expect(getHttpStatusName(999)).toBe("UNKNOWN");
    });

    test("maps status names to codes", () => {
        expect(getHttpStatusCode("OK")).toBe(200);
        expect(getHttpStatusCode("BAD_REQUEST")).toBe(400);
        expect(getHttpStatusCode("NON_EXISTENT")).toBeNull();
    });

    test("returns status code info object", () => {
        expect(getHttpStatusCodeInfo(200)).toEqual({
            name: "OK",
            statusText: "OK"
        });
        expect(getHttpStatusCodeInfo(404)).toEqual({
            name: "NOT_FOUND",
            statusText: "Not Found"
        });
        expect(getHttpStatusCodeInfo(999)).toBeNull();
        expect(getHttpStatusCodeInfo("invalid")).toBeNull();
    });

    test("checks status code categories correctly", () => {
        expect(isInformationalStatus(100)).toBe(true);
        expect(isInformationalStatus(200)).toBe(false);

        expect(isSuccessStatus(200)).toBe(true);
        expect(isSuccessStatus(204)).toBe(true);
        expect(isSuccessStatus(301)).toBe(false);

        expect(isRedirectStatus(301)).toBe(true);
        expect(isRedirectStatus(302)).toBe(true);
        expect(isRedirectStatus(400)).toBe(false);

        expect(isClientErrorStatus(400)).toBe(true);
        expect(isClientErrorStatus(404)).toBe(true);
        expect(isClientErrorStatus(413)).toBe(true);
        expect(isClientErrorStatus(500)).toBe(false);

        expect(isServerErrorStatus(500)).toBe(true);
        expect(isServerErrorStatus(503)).toBe(true);
        expect(isServerErrorStatus(404)).toBe(false);

        expect(isErrorStatus(400)).toBe(true);
        expect(isErrorStatus(404)).toBe(true);
        expect(isErrorStatus(500)).toBe(true);
        expect(isErrorStatus(200)).toBe(false);
        expect(isErrorStatus(302)).toBe(false);
    });

    test("freezes status code dictionaries", () => {
        expect(Object.isFrozen(httpStatusCodeInfo)).toBe(true);
        expect(Object.isFrozen(httpStatusCodes)).toBe(true);
    });
});
