import Util from "../../util/Util.js";
import StreamPipeline from "../../util/commands/stream/StreamPipeline.js";

function resolvePipeline(tag, invocationArgs) {
    let pipelineText = "",
        initialInput = "";

    if (tag != null && Util.nonemptyString(tag.args)) {
        if (tag.args.includes("$")) {
            pipelineText = tag.args.replaceAll("$", invocationArgs ?? "").trim();
        } else {
            pipelineText = tag.args;
            initialInput = invocationArgs ?? "";
        }
    } else {
        pipelineText = invocationArgs ?? "";
    }

    return {
        pipelineText: String(pipelineText ?? "").trim(),
        initialInput: String(initialInput ?? "").trim()
    };
}

const streamHandler = async (tag, args, values, options) => {
    const { pipelineText, initialInput } = resolvePipeline(tag, args);

    if (Util.empty(pipelineText)) {
        return "usage: `%t stream tag1 > tag2 > ... > tagN`";
    }

    const pipeline = StreamPipeline.parse(pipelineText);
    return await pipeline.execute(initialInput, { values, options });
};

const FakeTags = Object.freeze([
    {
        name: "stream",
        execute: streamHandler
    },
    {
        name: "pipe",
        execute: streamHandler
    }
]);

export default FakeTags;
