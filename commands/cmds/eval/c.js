export default {
    name: "c",
    parent: "eval",
    subcommand: true,
    handler: function(args, msg) {
        return this.parentCmd.altevalBase(args, msg, 75);
    }
}