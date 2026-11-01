import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import EmulationCommandUtil from "../../util/commands/EmulationCommandUtil.js";
import getInspectorAttachOutput from "../../util/getInspectorAttachOutput.js";

class VMEvalCommand {
    static info = {
        name: "vm_eval",
        arguments: [
            {
                name: "debug",
                kind: "option",
                type: "boolean",
                aliases: ["d"]
            },
            ...EmulationCommandUtil.getMessageCliArguments(),
            {
                name: "code",
                kind: "rest",
                required: true
            }
        ]
    };

    async handler(ctx) {
        const parsed = await EmulationCommandUtil.resolveGuessedPathBody(ctx.arg("code"), {
            name: "script"
        });

        if (parsed.err !== null) {
            return `Error: ${parsed.err.message}`;
        }

        const code = parsed.body;

        if (Util.empty(code)) {
            return "Can't eval an empty script.";
        }

        const { user_id, emulatedMsg } = await EmulationCommandUtil.createCliMessageInput(ctx, code);

        let out = null;

        try {
            if (ctx.arg("debug")) {
                out = await getClient().tagVM.runScript(
                    code,
                    {
                        msg: emulatedMsg
                    },
                    {
                        commandContext: ctx,
                        enableInspector: true,
                        inspectorSourceUrl: "file:///eval.js",
                        inspectorTitle: `eval inspector [${user_id}]`,
                        onInspectorReady: info => console.log(getInspectorAttachOutput(info))
                    }
                );

                return out;
            }

            out = await getClient().tagVM.runScript(
                code,
                {
                    msg: emulatedMsg
                },
                {
                    commandContext: ctx
                }
            );
        } catch (err) {
            if (err.name !== "VMError") {
                throw err;
            }

            out = `VMError: ${err.message}`;
        }

        return out;
    }
}

export default VMEvalCommand;
