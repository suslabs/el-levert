class AICallLedger {
    static repeatNote = "You already made this exact call; this is its result. Use it instead of calling again.";
    static budgetNote =
        "You've used this tool as many times as allowed for one answer. Answer with what you have, or say what you couldn't find.";

    static _getKey(call) {
        return `${call.name}:${JSON.stringify(call.args)}`;
    }

    constructor(tools) {
        this.tools = tools;

        this.results = new Map();
        this.counts = new Map();
    }

    async run(call, execute) {
        const key = AICallLedger._getKey(call);

        if (this.results.has(key)) {
            return { repeated: true, note: AICallLedger.repeatNote, result: await this.results.get(key) };
        }

        const count = this.counts.get(call.name) ?? 0;

        if (count >= this.tools.getMaxCalls(call.name)) {
            return { error: AICallLedger.budgetNote };
        }

        this.counts.set(call.name, count + 1);

        const pending = execute();
        this.results.set(key, pending);

        return await pending;
    }
}

export default AICallLedger;
