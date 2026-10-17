const httpStatusCodeInfo = Object.freeze({
    100: {
        name: "CONTINUE",
        statusText: "Continue"
    },
    101: {
        name: "SWITCHING_PROTOCOLS",
        statusText: "Switching Protocols"
    },
    102: {
        name: "PROCESSING",
        statusText: "Processing"
    },
    103: {
        name: "EARLY_HINTS",
        statusText: "Early Hints"
    },
    200: {
        name: "OK",
        statusText: "OK"
    },
    201: {
        name: "CREATED",
        statusText: "Created"
    },
    202: {
        name: "ACCEPTED",
        statusText: "Accepted"
    },
    203: {
        name: "NON_AUTHORITATIVE_INFORMATION",
        statusText: "Non-Authoritative Information"
    },
    204: {
        name: "NO_CONTENT",
        statusText: "No Content"
    },
    205: {
        name: "RESET_CONTENT",
        statusText: "Reset Content"
    },
    206: {
        name: "PARTIAL_CONTENT",
        statusText: "Partial Content"
    },
    207: {
        name: "MULTI_STATUS",
        statusText: "Multi-Status"
    },
    208: {
        name: "ALREADY_REPORTED",
        statusText: "Already Reported"
    },
    226: {
        name: "IM_USED",
        statusText: "IM Used"
    },
    300: {
        name: "MULTIPLE_CHOICES",
        statusText: "Multiple Choices"
    },
    301: {
        name: "MOVED_PERMANENTLY",
        statusText: "Moved Permanently"
    },
    302: {
        name: "FOUND",
        statusText: "Found"
    },
    303: {
        name: "SEE_OTHER",
        statusText: "See Other"
    },
    304: {
        name: "NOT_MODIFIED",
        statusText: "Not Modified"
    },
    305: {
        name: "USE_PROXY",
        statusText: "Use Proxy"
    },
    307: {
        name: "TEMPORARY_REDIRECT",
        statusText: "Temporary Redirect"
    },
    308: {
        name: "PERMANENT_REDIRECT",
        statusText: "Permanent Redirect"
    },
    400: {
        name: "BAD_REQUEST",
        statusText: "Bad Request"
    },
    401: {
        name: "UNAUTHORIZED",
        statusText: "Unauthorized"
    },
    402: {
        name: "PAYMENT_REQUIRED",
        statusText: "Payment Required"
    },
    403: {
        name: "FORBIDDEN",
        statusText: "Forbidden"
    },
    404: {
        name: "NOT_FOUND",
        statusText: "Not Found"
    },
    405: {
        name: "METHOD_NOT_ALLOWED",
        statusText: "Method Not Allowed"
    },
    406: {
        name: "NOT_ACCEPTABLE",
        statusText: "Not Acceptable"
    },
    407: {
        name: "PROXY_AUTHENTICATION_REQUIRED",
        statusText: "Proxy Authentication Required"
    },
    408: {
        name: "REQUEST_TIMEOUT",
        statusText: "Request Timeout"
    },
    409: {
        name: "CONFLICT",
        statusText: "Conflict"
    },
    410: {
        name: "GONE",
        statusText: "Gone"
    },
    411: {
        name: "LENGTH_REQUIRED",
        statusText: "Length Required"
    },
    412: {
        name: "PRECONDITION_FAILED",
        statusText: "Precondition Failed"
    },
    413: {
        name: "PAYLOAD_TOO_LARGE",
        statusText: "Payload Too Large"
    },
    414: {
        name: "URI_TOO_LONG",
        statusText: "URI Too Long"
    },
    415: {
        name: "UNSUPPORTED_MEDIA_TYPE",
        statusText: "Unsupported Media Type"
    },
    416: {
        name: "RANGE_NOT_SATISFIABLE",
        statusText: "Range Not Satisfiable"
    },
    417: {
        name: "EXPECTATION_FAILED",
        statusText: "Expectation Failed"
    },
    418: {
        name: "IM_A_TEAPOT",
        statusText: "I'm a Teapot"
    },
    421: {
        name: "MISDIRECTED_REQUEST",
        statusText: "Misdirected Request"
    },
    422: {
        name: "UNPROCESSABLE_ENTITY",
        statusText: "Unprocessable Entity"
    },
    423: {
        name: "LOCKED",
        statusText: "Locked"
    },
    424: {
        name: "FAILED_DEPENDENCY",
        statusText: "Failed Dependency"
    },
    425: {
        name: "TOO_EARLY",
        statusText: "Too Early"
    },
    426: {
        name: "UPGRADE_REQUIRED",
        statusText: "Upgrade Required"
    },
    428: {
        name: "PRECONDITION_REQUIRED",
        statusText: "Precondition Required"
    },
    429: {
        name: "TOO_MANY_REQUESTS",
        statusText: "Too Many Requests"
    },
    431: {
        name: "REQUEST_HEADER_FIELDS_TOO_LARGE",
        statusText: "Request Header Fields Too Large"
    },
    451: {
        name: "UNAVAILABLE_FOR_LEGAL_REASONS",
        statusText: "Unavailable For Legal Reasons"
    },
    500: {
        name: "INTERNAL_SERVER_ERROR",
        statusText: "Internal Server Error"
    },
    501: {
        name: "NOT_IMPLEMENTED",
        statusText: "Not Implemented"
    },
    502: {
        name: "BAD_GATEWAY",
        statusText: "Bad Gateway"
    },
    503: {
        name: "SERVICE_UNAVAILABLE",
        statusText: "Service Unavailable"
    },
    504: {
        name: "GATEWAY_TIMEOUT",
        statusText: "Gateway Timeout"
    },
    505: {
        name: "HTTP_VERSION_NOT_SUPPORTED",
        statusText: "HTTP Version Not Supported"
    },
    506: {
        name: "VARIANT_ALSO_NEGOTIATES",
        statusText: "Variant Also Negotiates"
    },
    507: {
        name: "INSUFFICIENT_STORAGE",
        statusText: "Insufficient Storage"
    },
    508: {
        name: "LOOP_DETECTED",
        statusText: "Loop Detected"
    },
    510: {
        name: "NOT_EXTENDED",
        statusText: "Not Extended"
    },
    511: {
        name: "NETWORK_AUTHENTICATION_REQUIRED",
        statusText: "Network Authentication Required"
    }
});

const httpStatusCodes = Object.freeze(
    Object.fromEntries(Object.entries(httpStatusCodeInfo).map(([code, info]) => [info.name, Number(code)]))
);

function getHttpStatusCodeInfo(code) {
    if (typeof code !== "number") {
        return null;
    }

    return httpStatusCodeInfo[code] ?? null;
}

const getHttpStatusCode = name => httpStatusCodes[name] ?? null;
const getHttpStatusName = code => getHttpStatusCodeInfo(code)?.name ?? "UNKNOWN";
const getHttpStatusText = code => getHttpStatusCodeInfo(code)?.statusText ?? "Unknown Status";

const isInformationalStatus = code => typeof code === "number" && code >= 100 && code < 200;
const isSuccessStatus = code => typeof code === "number" && code >= 200 && code < 300;
const isRedirectStatus = code => typeof code === "number" && code >= 300 && code < 400;
const isClientErrorStatus = code => typeof code === "number" && code >= 400 && code < 500;
const isServerErrorStatus = code => typeof code === "number" && code >= 500 && code < 600;
const isErrorStatus = code => typeof code === "number" && code >= 400 && code < 600;

export {
    httpStatusCodeInfo,
    httpStatusCodes,
    getHttpStatusCode,
    getHttpStatusCodeInfo,
    getHttpStatusName,
    getHttpStatusText,
    isInformationalStatus,
    isSuccessStatus,
    isRedirectStatus,
    isClientErrorStatus,
    isServerErrorStatus,
    isErrorStatus
};
