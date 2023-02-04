export default {
    name: "py",
    parent: "eval",
    subcommand: true,
    handler: function(args, msg) {
        return this.parentCmd.altevalBase(args, msg, 71);
    }
}