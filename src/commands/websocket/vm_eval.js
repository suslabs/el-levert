import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import EmulationCommandUtil from "../../util/commands/EmulationCommandUtil.js";
import getInspectorAttachOutput from "../../util/getInspectorAttachOutput.js";

class VMEvalCommand {
    static info = {
        name: "vm_eval",
        arguments: [
            {
                name: "code",
                type: "string",
                required: true
            },
            {
                name: "debug",
                type: "boolean",
                defaultValue: false
            },
            {
                name: "msg",
                kind: "group",
                properties: EmulationCommandUtil.getMessageGroupProperties()
            },
            {
                name: "sourceUrl",
                type: "string"
            }
        ],
        response: [
            {
                name: "output",
                type: "any"
            }
        ]
    };

    async handler(ctx) {
        const code = ctx.args.code,
            debug = ctx.args.debug;

        if (!Util.nonemptyString(code)) {
            return {
                output: "Can't eval an empty script."
            };
        }

        const { user_id, emulatedMsg } = await EmulationCommandUtil.createMessageInput(code, ctx.args.msg);

        let out = null;

        try {
            if (debug) {
                out = await getClient().tagVM.runScript(
                    code,
                    {
                        msg: emulatedMsg
                    },
                    {
                        commandContext: ctx,
                        enableInspector: true,
                        inspectorSourceUrl: ctx.args.sourceUrl ?? "file:///eval.js",
                        inspectorTitle: `eval inspector [${user_id}]`,
                        onInspectorReady: info => {
                            ctx.send("inspector_ready", getInspectorAttachOutput(info));
                        }
                    }
                );

                return {
                    output: out
                };
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

        return {
            output: out
        };
    }
}

export default VMEvalCommand;
