import Util from "../util/Util.js";

class FakeMsg {
    constructor(msg) {
        this.msg = msg;
        this.fixedMsg = Util.removeCircRef(msg);
    }

    reply(text, options) {
        let out = {};

        if(typeof text === "object") {
            options = text;
        } else {
            out.content = text || "";
        }

        if(typeof options !== "undefined") {
            if(typeof options.embed !== "undefined") {
                const embed = options.embed;
                embed.description = embed.description || "";


                
                out.embeds = [
                    embed
                ];
            }

            if(typeof options.file !== "undefined") {
                out.file = options.file;
            }
        }
        
        return JSON.stringify(out);
    }
}

export default FakeMsg;