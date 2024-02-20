import { getClient } from "../../../LevertClient.js";

export default {
    name: "py",
    parent: "eval",
    subcommand: true,
    load: _ => getClient().config.enableOtherLangs,
    handler: function (args, msg) {
        return this.parentCmd.altevalBase(args, msg, 71);
    }
};
