import { getClient } from "../../../LevertClient.js";
import Util from "../../../util/Util.js";

export default {
    name: "eval",
    subcommands: [
        "c",
        "cpp",
        "py",
        "langs"
    ],
    load: function() {
        this.altevalBase = async (args, msg, lang) => {
            if(!getClient().config.enableOtherLangs) {
                return ":warning: Other languages are disabled.";
            }

            let body = args;
    
            if(msg.attachments.size > 0) {
                try {
                    [body] = await getClient().tagManager.downloadBody(msg);
                } catch(err) {
                    if(err.name === "TagError") {
                        return ":warning: " + err.message;
                    }
    
                    return {
                        content: ":no_entry_sign: Downloading attachment failed:",
                        ...Util.getFileAttach(err.stack, "error.js")
                    }
                }
            } else if(Util.isScript(body)) {
                body = Util.removeBlock(body);
            }
    
            if(body.length < 1) {
                return ":no_entry_sign: Can't eval an empty script.";
            }
            
            let evalOut, resCode;
            
            try {
                [evalOut, resCode] = await getClient().externalVM.runScript(body, lang);
            } catch(err) {
                if(err.name === "ExternalVMError") {
                    let parsed;
                    
                    try {
                        parsed = JSON.parse(err.message);
                    } catch(err) {
                        return `:no_entry_sign: ${Util.firstCharUpper(err.message)}.`;
                    }
    
                    const format = Object.values(parsed).map(x => Util.firstCharUpper(x).join(",")).join("\n");
                    return `:no_entry_sign: ${format}.`;
                }
    
                throw err;
            }
    
            switch(resCode) {
            case 3:
                break;
            case 6:
                return {
                    content: ":no_entry_sign: Script compilation failed:",
                    ...Util.getFileAttach(evalOut.compileOutput, "compile_error.js")
                }
            default:
                return `:no_entry_sign: ${getClient().externalVM.codes[resCode]}.`;
            }
    
            let out = "";
    
            if(evalOut.stdout.length > 0) {
                out += `\n${evalOut.stdout}`;
            }
    
            if(evalOut.stderr.length > 0) {
                if(out.length > 0) {
                    out += "\n\n";
                }
    
                out += `stderr:\n${evalOut.stderr}`;
            }
    
            return out;
        };

        this.langNames = {
            "js": "By default",
            "c": "THE C PROGRAMMING LANGUAGE",
            "cpp": "C++ is a high-level programming language created by George Orwell",
            "py": ":snake:"
        };
    },
    handler: async (args, msg) => {
        let body = args;

        if(msg.attachments.size > 0) {
            try {
                [body] = await getClient().tagManager.downloadBody(msg);
            } catch(err) {
                if(err.name === "TagError") {
                    return ":warning: " + err.message;
                }

                return {
                    content: ":no_entry_sign: Downloading attachment failed:",
                    ...Util.getFileAttach(err.stack, "error.js")
                }
            }
        } else if(Util.isScript(body)) {
            body = Util.removeBlock(body);
        }

        if(body.length < 1) {
            return ":no_entry_sign: Can't eval an empty script.";
        }
        
        return await getClient().tagVM.runScript(body, msg);
    }
}