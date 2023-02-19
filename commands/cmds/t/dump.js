import Util from "../../../util/Util.js";
import { getClient } from "../../../LevertClient.js";

export default {
    name: "dump",
    parent: "tag",
    subcommand: true,
    handler: async _ => {
        const tags = await getClient().tagManager.dump();
        
        if(tags.length < 1) {
            return ":warning: There are no registered tags.";
        }

        return Util.getFileAttach(tags.join("\n"));
    }
}