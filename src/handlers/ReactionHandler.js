import { ChannelType } from "discord.js";

import Handler from "./Handler.js";

import { getClient, getLogger } from "../LevertClient.js";
import Util from "../util/Util.js";

function logParansUsage(msg, parans) {
    const s = parans.total > 1 ? "e" : "i";

    getLogger().info(
        `Reacting with ${parans.total} parenthes${s}s to message sent by user ${msg.author.id} (${msg.author.username}) in channel ${msg.channel.id} (${Util.formatChannelName(msg.channel)}).`
    );
}

function logWordsUsage(msg, words) {
    getLogger().info(
        `Reacting to word(s): "${words.join('", "')}" sent by user ${msg.author.id} (${msg.author.username}) in channel ${msg.channel.id} (${Util.formatChannelName(msg.channel)}).`
    );
}

function logReactTime(t1) {
    const t2 = performance.now();
    getLogger().debug(`Reacting took ${Util.timeDelta(t2, t1).toLocaleString()}ms.`);
}

function logRemove(msg, count) {
    getLogger().debug(
        `Removing ${count} reactions from message ${msg.id} sent by user ${msg.author.id} (${msg.author.username}) in channel ${msg.channel.id} (${Util.formatChannelName(msg.channel)}).`
    );
}

function logRemoveTime(t1) {
    const t2 = performance.now();
    getLogger().debug(`Removing reactions took ${Util.timeDelta(t2, t1).toLocaleString()}ms.`);
}

function getReact(list) {
    if (list.length === 1) {
        return Util.firstElement(list);
    }

    return Util.randomElement(list);
}

const emojiChars = ":;=-x+";

const emojiExpRight = new RegExp(`[${Util.escapeCharClass(emojiChars)}][()]+`, "g"),
    emojiExpLeft = new RegExp(`[()]+[${Util.escapeCharClass(emojiChars)}]`, "g");

class ReactionHandler extends Handler {
    static $name = "reactionHandler";
    priority = -1;

    constructor(enabled) {
        super(enabled, false);

        this.multipleReacts = getClient().reactions.multipleReacts ?? false;

        this.setWords();
        this.setParans();
    }

    getWordList(funnyWords) {
        let wordList = [];

        for (const elem of funnyWords) {
            const words = elem.word ?? elem.words;

            if (Array.isArray(words)) {
                wordList = wordList.concat(words);
                continue;
            } else if (typeof words === "string") {
                wordList.push(words);
            }
        }

        return wordList;
    }

    getReactMap(funnyWords) {
        const reactMap = new Map();

        for (const elem of funnyWords) {
            let words = elem.word ?? elem.words,
                reacts = elem.react ?? elem.reacts;

            if (typeof reacts === "string") {
                reacts = [reacts];
            }

            if (Array.isArray(words)) {
                words.forEach(word => reactMap.set(word, reacts));
            } else if (typeof words === "string") {
                reactMap.set(words, reacts);
            }
        }

        return reactMap;
    }

    setWords() {
        this.funnyWords = getClient().reactions.funnyWords;

        this.wordList = this.getWordList(this.funnyWords);
        this.reactMap = this.getReactMap(this.funnyWords);
    }

    setParans() {
        this.parans = getClient().reactions.parans;

        this.enableParans = typeof this.parans.left !== "undefined" && typeof this.parans.right !== "undefined";
    }

    countUnmatchedParans(str) {
        if (!str.includes("(") && !str.includes(")")) {
            return;
        }

        let open = 0;

        const parans = {
            left: 0,
            right: 0,
            total: 0
        };

        let cleaned = str.replace(emojiExpRight, match => " ".repeat(match.length));
        cleaned = cleaned.replace(emojiExpLeft, match => " ".repeat(match.length));

        for (let i = 0; i < cleaned.length; i++) {
            const char = cleaned[i];

            switch (char) {
                case "(":
                    open++;
                    break;
                case ")":
                    if (open > 0) {
                        open--;
                    } else {
                        parans.right++;
                    }

                    break;
            }
        }

        parans.left = Util.clamp(open, 0, this.parans.right.length);
        parans.right = Util.clamp(parans.right, 0, this.parans.left.length);

        parans.total = parans.left + parans.right;

        return parans;
    }

    async paransReact(msg) {
        const t1 = performance.now(),
            parans = this.countUnmatchedParans(msg.content);

        if (typeof parans === "undefined" || parans.total < 1) {
            return false;
        }

        logParansUsage(msg, parans);

        if (parans.right > 0) {
            try {
                for (let i = 0; i < parans.right; i++) {
                    await msg.react(this.parans.left[i]);
                }
            } catch (err) {
                getLogger().error("Failed to react to message:", err);
            }
        }

        if (parans.left > 0) {
            try {
                for (let i = 0; i < parans.left; i++) {
                    await msg.react(this.parans.right[i]);
                }
            } catch (err) {
                getLogger().error("Failed to react to message:", err);
            }
        }

        logReactTime(t1);
        return true;
    }

    getWordCounts(str) {
        let normStr = str.toLowerCase();
        normStr = normStr.normalize("NFKD");

        const foundWords = this.wordList.map(word => [word, normStr.indexOf(word)]).filter(x => x[1] >= 0);

        if (foundWords.length < 1) {
            return;
        }

        const counts = foundWords.reduce(
            (counts, [word]) => ({
                ...counts,
                [word]: 0
            }),
            {}
        );

        let foundOne = false;

        for (let [word, index] of foundWords) {
            while (index !== -1) {
                const startValid = index === 0 || normStr[index - 1] === " ",
                    endValid = index + word.length === normStr.length || normStr[index + word.length] === " ";

                if (startValid && endValid) {
                    counts[word]++;
                    foundOne = true;

                    if (!this.multipleReacts) {
                        break;
                    }
                }

                index = normStr.indexOf(word, index + 1);
            }
        }

        if (!foundOne) {
            return;
        }

        Util.wipeObject(counts, (_, count) => count === 0);
        return counts;
    }

    async singleReact(msg, words) {
        words = Object.keys(words);
        const reactLists = new Set(words.map(w => this.reactMap.get(w)));

        for (const list of reactLists) {
            const react = getReact(list);

            if (typeof react !== "undefined") {
                await msg.react(react);
            }
        }
    }

    async multipleReact(msg, words) {
        const reacts = new Set();

        for (const [word, count] of Object.entries(words)) {
            const reactList = this.reactMap.get(word);

            for (let i = 0; i < count; i++) {
                const react = this.getReact(reactList);

                if (typeof react !== "undefined") {
                    reacts.add(react);
                }
            }
        }

        for (const react of reacts) {
            await msg.react(react);
        }
    }

    async funnyReact(msg) {
        const t1 = performance.now(),
            words = this.getWordCounts(msg.content);

        if (typeof words === "undefined") {
            return false;
        }

        logWordsUsage(msg, Object.keys(words));

        let reactFunc;

        if (this.multipleReacts) {
            reactFunc = this.multipleReact;
        } else {
            reactFunc = this.singleReact;
        }

        reactFunc = reactFunc.bind(this);

        try {
            await reactFunc(msg, words);
        } catch (err) {
            getLogger().error("Failed to react to message:", err);
        }

        logReactTime(t1);
        return true;
    }

    async execute(msg) {
        if (msg.channel.type === ChannelType.DM) {
            return;
        }

        const reacted = await this.funnyReact(msg);

        if (reacted && !this.multipleReacts) {
            return;
        }

        if (this.enableParans) {
            await this.paransReact(msg);
        }
    }

    async removeReacts(msg) {
        const t1 = performance.now();

        const botId = getClient().client.user.id,
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
