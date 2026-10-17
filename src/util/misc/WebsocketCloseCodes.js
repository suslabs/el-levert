import CaseUtil from "./CaseUtil.js";

function defineCloseCode(code, name, reason) {
    const info = Object.freeze({
        name,
        reason: reason ?? CaseUtil.toWords(name, true)
    });

    return [code, info];
}

const standardWsCloseCodeInfo = Object.freeze(
    Object.fromEntries([
        defineCloseCode(1000, "NORMAL_CLOSURE"),
        defineCloseCode(1001, "GOING_AWAY"),
        defineCloseCode(1002, "PROTOCOL_ERROR"),
        defineCloseCode(1003, "UNSUPPORTED_DATA"),
        defineCloseCode(1004, "RESERVED"),
        defineCloseCode(1005, "NO_STATUS_RCVD"),
        defineCloseCode(1006, "ABNORMAL_CLOSURE"),
        defineCloseCode(1007, "INVALID_FRAME_PAYLOAD_DATA"),
        defineCloseCode(1008, "POLICY_VIOLATION"),
        defineCloseCode(1009, "MESSAGE_TOO_BIG"),
        defineCloseCode(1010, "MANDATORY_EXTENSION"),
        defineCloseCode(1011, "INTERNAL_ERROR"),
        defineCloseCode(1012, "SERVICE_RESTART"),
        defineCloseCode(1013, "TRY_AGAIN_LATER"),
        defineCloseCode(1014, "BAD_GATEWAY"),
        defineCloseCode(1015, "TLS_HANDSHAKE", "TLS Handshake")
    ])
);

const otherWsCloseCodeInfo = Object.freeze(
    Object.fromEntries([
        defineCloseCode(3000, "UNAUTHORIZED"),
        defineCloseCode(3003, "FORBIDDEN"),
        defineCloseCode(3008, "TIMEOUT"),
        defineCloseCode(4000, "UNKNOWN_ERROR"),
        defineCloseCode(4001, "UNKNOWN_OPCODE"),
        defineCloseCode(4002, "DECODE_ERROR"),
        defineCloseCode(4003, "NOT_AUTHENTICATED"),
        defineCloseCode(4004, "AUTHENTICATION_FAILED"),
        defineCloseCode(4005, "ALREADY_AUTHENTICATED"),
        defineCloseCode(4007, "INVALID_SEQ"),
        defineCloseCode(4008, "RATE_LIMITED"),
        defineCloseCode(4009, "SESSION_TIMEOUT"),
        defineCloseCode(4010, "INVALID_SHARD"),
        defineCloseCode(4011, "SHARDING_REQUIRED"),
        defineCloseCode(4012, "INVALID_API_VERSION"),
        defineCloseCode(4013, "INVALID_INTENTS"),
        defineCloseCode(4014, "DISALLOWED_INTENTS"),
        defineCloseCode(4400, "BAD_REQUEST"),
        defineCloseCode(4401, "UNAUTHORIZED_CLIENT"),
        defineCloseCode(4403, "FORBIDDEN_CLIENT"),
        defineCloseCode(4406, "SUBPROTOCOL_NOT_ACCEPTABLE"),
        defineCloseCode(4408, "CONNECTION_INIT_TIMEOUT", "Connection Initialisation Timeout"),
        defineCloseCode(4409, "SUBSCRIBER_ALREADY_EXISTS"),
        defineCloseCode(4429, "TOO_MANY_INIT_REQUESTS", "Too Many Initialisation Requests"),
        defineCloseCode(4500, "INTERNAL_SERVER_ERROR")
    ])
);

const wsCloseCodeInfo = Object.freeze({
    ...standardWsCloseCodeInfo,
    ...otherWsCloseCodeInfo
});

function getRangeCloseCodeInfo(code) {
    if (typeof code !== "number") {
        return null;
    }

    switch (true) {
        case code >= 0 && code <= 999:
            return {
                name: "NOT_USED",
                reason: "Not Used"
            };
        case code >= 1016 && code <= 2999:
            return {
                name: "UNASSIGNED_FUTURE_STANDARD",
                reason: "For Future Standard Use"
            };
        case code >= 3000 && code <= 3999:
            return {
                name: "UNASSIGNED_REGISTERABLE",
                reason: "Unassigned Registerable Close Code"
            };
        case code >= 4000 && code <= 4999:
            return {
                name: "PRIVATE_USE",
                reason: "Private Use"
            };
        default:
            return null;
    }
}

function createCloseCodeRegistry(closeCodeInfo) {
    closeCodeInfo = Object.freeze({
        ...wsCloseCodeInfo,
        ...closeCodeInfo
    });

    const closeCodes = Object.freeze(
        Object.fromEntries(Object.entries(closeCodeInfo).map(([code, info]) => [info.name, Number(code)]))
    );

    const getCloseCodeInfo = code => {
        if (typeof code !== "number") {
            return null;
        }

        return closeCodeInfo[code] ?? getRangeCloseCodeInfo(code);
    };

    const getCloseCode = name => closeCodes[name] ?? null;
    const getCloseName = code => getCloseCodeInfo(code)?.name ?? "UNKNOWN";
    const getCloseReason = code => getCloseCodeInfo(code)?.reason ?? "Unknown";

    return Object.freeze({
        closeCodeInfo,
        closeCodes,
        getCloseCode,
        getCloseCodeInfo,
        getCloseName,
        getCloseReason
    });
}

const defaultRegistry = createCloseCodeRegistry({});

const wsCloseCodes = defaultRegistry.closeCodes,
    closeCodes = wsCloseCodes,
    getCloseCode = defaultRegistry.getCloseCode,
    getCloseCodeInfo = defaultRegistry.getCloseCodeInfo,
    getCloseName = defaultRegistry.getCloseName,
    getCloseReason = defaultRegistry.getCloseReason;

const isReservedCloseCode = code => typeof code === "number" && code >= 0 && code <= 999;
const isStandardCloseCode = code => typeof code === "number" && code >= 1000 && code <= 2999;
const isLibraryCloseCode = code => typeof code === "number" && code >= 3000 && code <= 3999;
const isApplicationCloseCode = code => typeof code === "number" && code >= 4000 && code <= 4999;

export {
    standardWsCloseCodeInfo,
    otherWsCloseCodeInfo,
    wsCloseCodeInfo,
    wsCloseCodes,
    closeCodes,
    defineCloseCode,
    createCloseCodeRegistry,
    getCloseCode,
    getCloseCodeInfo,
    getCloseName,
    getCloseReason,
    isReservedCloseCode,
    isStandardCloseCode,
    isLibraryCloseCode,
    isApplicationCloseCode
};
