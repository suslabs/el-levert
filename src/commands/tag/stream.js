import { getEmoji } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import StreamPipeline from "../../util/commands/stream/StreamPipeline.js";

class TagStreamCommand {
    static info = {
        name: "stream",
        aliases: ["pipe"],
        parent: "tag",
        subcommand: true,
        args: "<tag1 > tag2 > ... > tagN>",
        description: `Execute a pipeline of tags and stream operators separated by > or |.
Steps can be tag names or stream operators. Use $ in arguments to substitute piped input.

Operators:
- echo [text]: Outputs arguments or piped input ($ replaces input).
- unembed [url]: Extracts text from Discord embeds in objects, message URLs, or referenced messages.
- unescape: Removes markdown escape backslashes.
- trim: Trims leading and trailing whitespace.
- lower: Converts input to lowercase.
- upper: Converts input to uppercase.
- head [n|-n count]: Returns the first n lines of input (default: 10).
- tail [n|-n count]: Returns the last n lines of input (default: 10).`,
        usage: "- <pipeline>: Chain of tag names and stream operators separated by '>' or '|'.",
        parser: {
            requireArgs: true
        }
    };

    async handler(ctx) {
        let out;

        try {
            const pipeline = StreamPipeline.parse(ctx.argsText);

            out = await pipeline.execute("", {
                values: {
                    msg: ctx.msg
                },
                options: {
                    commandContext: ctx
                }
            });
        } catch (err) {
            return this.parentCmd.formatError(err);
        }

        return await this.parentCmd.formatReply(out, ctx.msg);
    }
}

export default TagStreamCommand;
