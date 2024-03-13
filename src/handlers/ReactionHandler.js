import Handler from "./Handler.js";

import Util from "../util/Util.js";

import { getClient, getLogger } from "../LevertClient.js";

const emojiChars = ":;=-x+";

class ReactionHandler extends Handler {
    constructor() {
        super(getClient().reactions.enableReacts, false);

        this.funnyWords = getClient().reactions.funnyWords;
        this.parans = getClient().reactions.parans;
    }

    countParans(str) {
        let parans = 0,
            isEmoji = false;

        str.split("").forEach(c => {
            if (emojiChars.includes(c)) {
                isEmoji = true;
            } else {
                switch (c) {
                    case "(":
                        if (isEmoji) {
                            return 0;
                        }

                        parans++;
                        break;
                    case ")":
                        if (isEmoji) {
                            return 0;
                        }

                        parans--;
                        break;
                    default:
                        isEmoji = false;
                        break;
                }
            }
        });

        const count = Math.min(Math.max(parans, -this.parans.left.length), this.parans.right.length);
        return isEmoji ? 0 : count;
    }

    async paransReact(msg) {
        if (typeof this.parans.left === "undefined" || typeof this.parans.right === "undefined") {
            return;
        }

        let parans = this.countParans(msg.content);

        if (parans > 0) {
            try {
                for (let i = 0; i < parans; i++) {
                    await msg.react(this.parans.right[i]);
                }
            } catch (err) {
                getLogger().error("Failed to react to message.", err);
            }
        } else if (parans < 0) {
            parans = Math.abs(parans);

            try {
                for (let i = 0; i < parans; i++) {
                    await msg.react(this.parans.left[i]);
                }
            } catch (err) {
                getLogger().error("Failed to react to message.", err);
            }
        }
    }

    findWord(word) {
        return this.funnyWords.find(x => {
            if (Array.isArray(x.words)) {
                return x.words.includes(word);
            } else {
                return x.words === word;
            }
        });
    }

    async funnyReact(msg) {
        let content = msg.content.toLowerCase();
        content = content.normalize("NFKD");

        const words = content.split(" ");

        try {
            for (const w of words) {
                const word = this.findWord(w);

                if (Array.isArray(word.react)) {
                    await msg.react(Util.randElement(word.react));
                } else if (typeof word.react === "string") {
                    await msg.react(word.react);
                }
            }
        } catch (err) {
            getLogger().error("Failed to react to message.", err);
        }
    }

    async execute(msg) {
        await this.paransReact(msg);
        await this.funnyReact(msg);
    }

    async delete(msg) {
        const botId = getClient().client.user.id,
            botReacts = msg.reactions.cache.filter(react => react.users.cache.has(botId));

        if (botReacts.size < 1) {
            return false;
        }

        try {
            for (const react of botReacts.values()) {
                await react.users.remove(getClient().user.id);
            }
        } catch (err) {
            getLogger().error("Failed to remove reactions from message.", err);
        }

        return true;
    }
}

export default ReactionHandler;
