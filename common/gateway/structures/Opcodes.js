import createEnum from "../../util/createEnum.js";

const Opcodes = createEnum({
    IDENTIFY: 0,
    CONNECT: 1,
    HEARTBEAT: 2,
    HEARTBEAT_ACK: 3,
    RESUME: 4,
    DISPATCH: 5,
    INVALID_SESSION: 6,
    RPC_REQUEST: 7,
    RPC_RESPONSE: 8
});

export default Opcodes;
