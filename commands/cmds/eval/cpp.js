export default {
    name: "cpp",
    parent: "eval",
    subcommand: true,
    handler: function(args, msg) {
        return this.parentCmd.altevalBase(args, msg, 76);
    }
}