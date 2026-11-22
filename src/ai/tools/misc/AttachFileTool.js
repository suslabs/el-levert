import AITool from "../AITool.js";
import ToolParams from "../ToolParams.js";

import AIPhases from "../../../structures/ai/AIPhases.js";

import Util from "../../../util/Util.js";

import AIError from "../../../errors/AIError.js";

class AttachFileTool extends AITool {
    static info = {
        name: "attach_file",
        phase: AIPhases.writing,
        description:
            "Attach a text file (code, scripts, data, long lists or tables) to your reply instead of pasting it into the answer. Attaching a file with the same name replaces it.",
        parameters: ToolParams.object(
            {
                name: ToolParams.string('File name with an extension, e.g. "script.js".'),
                content: ToolParams.string("Full file contents.")
            },
            ["name", "content"]
        )
    };

    static maxFiles = 3;
    static maxSize = Util.dataBytes.megabyte;

    static nameRegex = /^[\w-]+(\.[\w-]+)+$/;
    static maxNameLength = 64;

    getStatus(args) {
        return `Attaching ${this.formatArg(args.name)}`;
    }

    execute(args, session) {
        const name = String(args.name ?? "").trim(),
            content = String(args.content ?? "");

        if (name.length > AttachFileTool.maxNameLength || !AttachFileTool.nameRegex.test(name)) {
            throw new AIError("Invalid file name. Use letters, digits, - and _ with an extension, e.g. script.js");
        } else if (Util.empty(content)) {
            throw new AIError("The file is empty");
        } else if (Util.getByteLength(content) > AttachFileTool.maxSize) {
            throw new AIError(`The file is larger than ${Util.formatSize(AttachFileTool.maxSize)}`);
        } else if (!session.files.has(name) && session.files.size >= AttachFileTool.maxFiles) {
            throw new AIError(`At most ${AttachFileTool.maxFiles} files can be attached`);
        }

        session.files.set(name, content);
        return { attached: name };
    }
}

export default AttachFileTool;
