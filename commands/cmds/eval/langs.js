import { getClient } from "../../../LevertClient.js";

export default {
    name: "langs",
    parent: "eval",
    subcommand: true,
    handler: function() {
        const format = Object.keys(this.parentCmd.langNames)
                       .map((x, i) => `${i + 1}. ${x} - ${this.parentCmd.langNames[x]}`)
                       .join("\n");

        return `:information_source: Supported languages:\n${format}`;
    }
}