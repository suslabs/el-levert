import Util from "../../../util/Util.js";
import { getClient } from "../../../LevertClient.js";

export default {
    name: "list",
    parent: "perm",
    subcommand: true,
    handler: async (args, msg) => {
        const groups = await getClient().permManager.list();

        if(!groups) {
            return ":information_source: No permissions are registered.";
        }
        
        const format = groups.map((x, i) => `${i + 1}. ${x.name} - Level ${x.level} - Users:\n` + (
                       x.users.length > 0 ?
                       x.users.map((y, j) => `    ${j + 1}. \`${y.username}\` (${y.id})`).join("\n")
                       : "none")).join("\n");

        return {
            content: `:information_source: Registered permissions:`,
            ...Util.getFileAttach(format)
        };
    }
}