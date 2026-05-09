class ClearCommand {
    static info = {
        name: "clear"
    };

    handler() {
        console.clear();
    }
}

export default ClearCommand;
