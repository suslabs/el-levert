const wsCloseReasons = {
    1000: "Normal Closure",
    1001: "Going Away",
    1002: "Protocol Error",
    1003: "Unsupported Data",
    1005: "No Status Received",
    1006: "Abnormal Closure",
    1007: "Invalid Frame Payload Data",
    1008: "Policy Violation",
    1009: "Message Too Big",
    1010: "Mandatory Extension",
    1011: "Internal Error",
    1015: "TLS Handshake Failure"
};

function getCloseReason(code) {
    return wsCloseReasons[code] ?? "Unknown";
}

export default getCloseReason;
