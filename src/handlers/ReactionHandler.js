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
            const words = x.word ?? x.words;

            if (Array.isArray(words)) {
                return words.includes(word);
            } else if (typeof words === "string") {
                return words === word;
            }

            return false;
        });
    }

    getReact(word) {
        const reacts = word.react ?? word.reacts;

        if (Array.isArray(reacts)) {
            return Util.randElement(reacts);
        } else if (typeof reacts === "string") {
            return reacts;
        }

        return;
    }

    async funnyReact(msg) {
        let content = msg.content.toLowerCase();
        content = content.normalize("NFKD");

        const words = content.split(" ");

        try {
            for (const w of words) {
                const word = this.findWord(w);

                if (typeof word !== "undefined") {
                    const react = this.getReact(word);

                    if (typeof react !== "undefined") {
                        await msg.react(react);
                    }
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

    async removeReacts(msg) {
        const botId = getClient().client.user.id,
            botReacts = msg.reactions.cache.filter(react => react.users.cache.has(botId));

        if (botReacts.size < 1) {
            return;
        }

        try {
            for (const react of botReacts.values()) {
                await react.users.remove(botId);
            }
        } catch (err) {
            getLogger().error("Failed to remove reactions from message.", err);
        }
    }

    async resubmit(msg) {
        await this.removeReacts(msg);
        await this.execute(msg);
    }
}

export default ReactionHandler;
