export default {
    name: "reminder",
    subcommands: [
        "add",
        "list",
        "remove",
        "removeall"
    ],
    handler: async function(args, msg) {
        return `:information_source: %reminder [${this.subNames.join("|")}]`;
    }
}