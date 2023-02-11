import Util from "../../../util/Util.js";
import { getClient, getLogger } from "../../../LevertClient.js";

export default {
    name: "t",
    subcommands: [
        "add",
        "alias",
        "chown",
        "delete",
        "dump",
        "edit",
        "list",
        "owner",
        "quota",
        "raw",
        "search"
    ],
    handler: async function(args, msg) {
        if(args.length === 0) {
            return `:information_source: %t [${this.subNames.join("|")}] tag_name [tag_body]`;
        }

        const [t_name, t_args] = Util.splitArgs(args),
              e = getClient().tagManager.checkName(t_name);

        if(e) {
            return ":warning: " + e;
        }

        let tag = await getClient().tagManager.fetch(t_name);

        if(!tag) {            
            const find = await getClient().tagManager.search(t_name, 0.5);
            let out = `:warning: Tag **${t_name}** doesn't exist.`;
            
            if(find.length > 0) {
                out += `\nDid you mean: **${find.slice(0, 5).join("**, **")}**?`;
            }

            return out;
        }

        if(tag.hops.length > 1) {
            try {
                tag = await getClient().tagManager.fetchAlias(tag);
            } catch(err) {
                if(err.name === "TagError") {
                    switch(err.message) {
                    case "Tag recursion detected.":
                        return `:warning: Ebic recursion fail: **${err.ref.join("** -> **")}**`;
                    case "Hop not found.":
                        return `:warning: Tag **${err.ref}** doesn't exist.`;
                    }
                } 

                throw err;
            }
        }

        let out = "", prev;

        if(tag.type & 1) {
            if(tag.type & 4) {
                out = await getClient().tagVM2.runScript(tag.body, msg, t_args + tag.args);
            } else {
                out = await getClient().tagVM.runScript(tag.body, msg, t_args + tag.args);
            }
        } else {
            out = tag.body;
        }

        if(typeof out === "string" && getClient().handlers.previewHandler.canPreview(out)) {
            try {
                prev = await getClient().handlers.previewHandler.genPreview({
                    ...msg,
                    content: out
                });
            } catch(err) {
                getLogger().error("Preview gen failed", err);

                return {
                    content: `:no_entry_sign: Encountered exception while generating preview:`,
                    ...Util.getFileAttach(err.stack, "error.js")
                };
            }

            if(!prev) {
                return out;
            }

            out = out.replace(getClient().handlers.previewHandler.regex, "");

            if(out.length > 0) {
                prev.content = out;
            }

            return prev;
        }

        return out;
    }
}