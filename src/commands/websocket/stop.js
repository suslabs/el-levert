import { getClient } from "../../LevertClient.js";

class StopCommand {
    static info = {
        name: "stop",
        arguments: [],
        response: [
            {
                name: "success",
                type: "boolean"
            },
            {
                name: "message",
                type: "string"
            }
        ]
    };

    handler() {
        setTimeout(async () => {
            await getClient().stop(true);
        }, 500);

        return {
            success: true,
            message: "Stopping bot..."
        };
    }
}

export default StopCommand;
