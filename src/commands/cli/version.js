import { getClient } from "../../LevertClient.js";

class VersionCommand {
    static info = {
        name: "version"
    };

    handler() {
        return `Current bot version: ${getClient().version}`;
    }
}

export default VersionCommand;
