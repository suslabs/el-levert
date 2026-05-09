import { getClient, getEmoji } from "../../LevertClient.js";

class VersionCommand {
    static info = {
        name: "version",
        category: "info"
    };

    handler() {
        return `${getEmoji("info")} Current bot version: **${getClient().version}**`;
    }
}

export default VersionCommand;
