import { getClient } from "../../LevertClient.js";

class StopCommand {
    static info = {
        name: "stop"
    };

    async handler() {
        await getClient().stop(true);
    }
}

export default StopCommand;
