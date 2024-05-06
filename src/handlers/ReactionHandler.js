import Handler from "./Handler.js";

import { getClient, getLogger } from "../LevertClient.js";
import Util from "../util/Util.js";

const emojiChars = ":;=-x+";

function logParansUsage(msg, count) {
    getLogger().info(
        `Reacting with ${count} parans to message sent by user ${msg.author.id} (${msg.author.username}) in channel ${msg.channel.id} (${msg.channel.name}).`
    );
}

function logWordsUsage(msg, words) {
    getLogger().info(
        `Reacting to words: "${words.join('", "')}" sent by user ${msg.author.id} (${msg.author.username}) in channel ${msg.channel.id} (${msg.channel.name}).`
    );
}

function logReactTime(t1) {
    getLogger().debug(`Reacting took ${(Date.now() - t1).toLocaleString()}ms.`);
}

function logRemove(msg, count) {
    getLogger().debug(
        `Removing ${count} reactions from message ${msg.id} sent by user ${msg.author.id} (${msg.author.username}) in channel ${msg.channel.id} (${msg.channel.name}).`
    );
}

function logRemoveTime(t1) {
    getLogger().debug(`Removing reactions took ${(Date.now() - t1).toLocaleString()}ms.`);
}

class ReactionHandler extends Handler {
    constructor(enabled) {
        super(enabled, false);

        this.funnyWords = getClient().reactions.funnyWords;
        this.parans = getClient().reactions.parans;
    }

    countParans(str) {
        let parans = 0,
            isEmoji = false;

        const split = str.split("");

        for (const char of split) {
            if (emojiChars.includes(char)) {
                isEmoji = true;
            } else {
                switch (char) {
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
        }

        const count = Util.clamp(parans, -this.parans.left.length, this.parans.right.length);
        return isEmoji ? 0 : count;
    }

    async paransReact(msg) {
        if (typeof this.parans.left === "undefined" || typeof this.parans.right === "undefined") {
            return;
        }

        const t1 = Date.now(),
            parans = this.countParans(msg.content);

        if (parans === 0) {
            return;
        }

        logParansUsage(parans);

        if (parans > 0) {
            try {
                for (let i = 0; i < parans; i++) {
                    await msg.react(this.parans.right[i]);
                }
            } catch (err) {
                getLogger().error("Failed to react to message:", err);
            }
        } else if (parans < 0) {
            try {
                for (let i = 0; i < Math.abs(parans); i++) {
                    await msg.react(this.parans.left[i]);
                }
            } catch (err) {
                getLogger().error("Failed to react to message:", err);
            }
        }

        logReactTime(t1);
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
            return Util.randomElement(reacts);
        } else if (typeof reacts === "string") {
            return reacts;
        }

        return;
    }

    getWords(str) {
        let normStr = str.toLowerCase();
        normStr = str.normalize("NFKD");

        const split = normStr.split(" "),
            words = [];

        for (const w of split) {
            const word = this.findWord(w);

            if (typeof word !== "undefined") {
                words.push(word);
            }
        }

        return words;
    }

    async funnyReact(msg) {
        const t1 = Date.now(),
            words = this.getWords(msg.content);

        logWordsUsage(msg, words);

        try {
            for (const word of words) {
                const react = this.getReact(word);

                if (typeof react !== "undefined") {
                    await msg.react(react);
                }
            }
        } catch (err) {
            getLogger().error("Failed to react to message:", err);
        }

        logReactTime(t1);
    }

    async execute(msg) {
        await this.paransReact(msg);
        await this.funnyReact(msg);
    }

    async removeReacts(msg) {
        const t1 = Date.now(),
            botId = getClient().client.user.id,
            botReacts = msg.reactions.cache.filter(react => react.users.cache.has(botId));

        if (botReacts.size < 1) {
            return;
        }

        logRemove(msg, botReacts.size);

        try {
            for (const react of botReacts.values()) {
                await react.users.remove(botId);
            }
        } catch (err) {
            getLogger().error("Failed to remove reactions from message:", err);
        }

        logRemoveTime(t1);
    }

    async resubmit(msg) {
        await this.removeReacts(msg);
        await this.execute(msg);
    }
}

export default ReactionHandler;
