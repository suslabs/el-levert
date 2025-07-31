import { ChannelType } from "discord.js";

import MessageHandler from "./MessageHandler.js";

import { getClient, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ObjectUtil from "../../util/ObjectUtil.js";
import RegexUtil from "../../util/misc/RegexUtil.js";
import DiscordUtil from "../../util/DiscordUtil.js";

import normalizeText from "../../util/misc/normalizeText.js";

function logParensUsage(msg, parens) {
    const s = parens.total > 1 ? "e" : "i";

    getLogger().info(
        `Reacting with ${parens.total} parenthes${s}s to message sent by user ${msg.author.id} (${msg.author.username}) in channel ${msg.channel.id} (${DiscordUtil.formatChannelName(msg.channel)}).`
    );
}

function logWordsUsage(msg, words) {
    getLogger().info(
        `Reacting to word(s): "${words.join('", "')}" sent by user ${msg.author.id} (${msg.author.username}) in channel ${msg.channel.id} (${DiscordUtil.formatChannelName(msg.channel)}).`
    );
}

function logReactTime(t1) {
    if (!getLogger().isDebugEnabled()) {
        return;
    }

    const t2 = performance.now();
    getLogger().debug(`Reacting took ${Util.formatNumber(Util.timeDelta(t2, t1))} ms.`);
}

function logRemove(msg, count) {
    if (!getLogger().isDebugEnabled()) {
        return;
    }

    getLogger().debug(
        `Removing ${count} reactions from message ${msg.id} sent by user ${msg.author.id} (${msg.author.username}) in channel ${msg.channel.id} (${DiscordUtil.formatChannelName(msg.channel)}).`
    );
}

function logRemoveTime(t1) {
    const t2 = performance.now();
    getLogger().debug(`Removing reactions took ${Util.formatNumber(Util.timeDelta(t2, t1))} ms.`);
}

class ReactionHandler extends MessageHandler {
    static $name = "reactionHandler";
    priority = -1;

    static emojiChars = ":;=-x+";

    constructor(enabled) {
        super(enabled, false);

        this.multipleReacts = getClient().reactions.multipleReacts ?? false;
    }

    async execute(msg) {
        if (msg.channel.type === ChannelType.DM) {
            return false;
        }

        let content = msg.content;

        const codeblockRanges = DiscordUtil.findCodeblocks(content);

        for (const range of codeblockRanges) {
            content = Util.removeRangeStr(content, ...range, true);
        }

        let reacted = await this._funnyReact(content, msg);

        if (reacted && !this.multipleReacts) {
            return true;
        } else if (this.enableParens) {
            reacted ||= await this._parensReact(content, msg);
        }

        return reacted;
    }

    async removeReacts(msg) {
        const t1 = performance.now();

        let botId = getClient().client.user.id,
            botReacts = msg.reactions.cache.filter(react => react.users.cache.has(botId));

        if (Util.empty(botReacts)) {
            return;
        }

        botReacts = Array.from(botReacts.values());
        logRemove(msg, botReacts.length);

        try {
            await Promise.all(botReacts.map(react => react.users.remove(botId)));
        } catch (err) {
            getLogger().error("Failed to remove reactions from message:", err);
        }

        logRemoveTime(t1);
    }

    async resubmit(msg) {
        await this.removeReacts(msg);
        await this.execute(msg);
    }

    load() {
        this._setWords();
        this._setParens();
    }

    static _emojiExpRight = new RegExp(`[${RegexUtil.escapeCharClass(this.emojiChars)}][()]+`, "g");
    static _emojiExpLeft = new RegExp(`[()]+[${RegexUtil.escapeCharClass(this.emojiChars)}]`, "g");

    static _getWordList(funnyWords) {
        return funnyWords.flatMap(elem => [].concat(elem.word ?? elem.words));
    }

    static _getReactMap(funnyWords) {
        const reactMap = new Map();

        for (const elem of funnyWords) {
            const words = [].concat(elem.word ?? elem.words),
                emojis = [].concat(elem.emoji ?? elem.emojis);

            words.forEach(word => reactMap.set(word, emojis));
        }

        return reactMap;
    }

    static _getEmoji(reactList) {
        if (Util.single(reactList)) {
            return Util.first(reactList);
        }

        return Util.randomElement(reactList);
    }

    _setWords() {
        this.funnyWords = getClient().reactions.funnyWords;

        this._wordList = ReactionHandler._getWordList(this.funnyWords);
        this._reactMap = ReactionHandler._getReactMap(this.funnyWords);
    }

    _setParens() {
        const parens = getClient().reactions.parens;

        this.enableParens = parens.left != null && parens.right != null;
        this.parens = parens;
    }

    _countUnmatchedParens(str) {
        const parens = {
            left: 0,
            right: 0,
            total: 0
        };

        if (!str.includes("(") && !str.includes(")")) {
            return parens;
        }

        let clean = str.replace(ReactionHandler._emojiExpRight, " ");
        clean = clean.replace(ReactionHandler._emojiExpLeft, " ");

        let open = 0,
            closed = 0;

        for (let i = 0; i < clean.length; i++) {
            const char = clean[i];

            switch (char) {
                case "(":
                    open++;
                    break;
                case ")":
                    if (open > 0) {
                        open--;
                    } else {
                        closed++;
                    }

                    break;
            }
        }

        parens.left = Util.clamp(open, 0, this.parens.right.length);
        parens.right = Util.clamp(closed, 0, this.parens.left.length);
        parens.total = parens.left + parens.right;

        return parens;
    }

    async _parensReact(content, msg) {
        const t1 = performance.now();

        const parens = this._countUnmatchedParens(content),
            { left, right, total } = parens;

        if (total < 1) {
            return false;
        }

        logParensUsage(msg, parens);

        const emojis = [...this.parens.left.slice(0, right), ...this.parens.right.slice(0, left)];

        try {
            await Promise.all(emojis.map(emoji => msg.react(emoji)));
        } catch (err) {
            getLogger().error("Failed to react to message:", err);
        }

        logReactTime(t1);
        return true;
    }

    _getWordCounts(str) {
        str = normalizeText(str);
        const foundWords = this._wordList.map(word => [word, str.indexOf(word)]).filter(x => x[1] >= 0);

        if (Util.empty(foundWords)) {
            return null;
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
                const startValid = index === 0 || str[index - 1] === " ",
                    endValid = index + word.length === str.length || str[index + word.length] === " ";

                if (startValid && endValid) {
                    counts[word]++;
                    foundOne = true;

                    if (!this.multipleReacts) {
                        break;
                    }
                }

                index = str.indexOf(word, index + 1);
            }
        }

        if (!foundOne) {
            return null;
        }

        ObjectUtil.wipeObject(counts, (_, count) => count === 0);
        return counts;
    }

    async _singleReact(msg, words) {
        words = Object.keys(words);
        const reactLists = new Set(words.map(w => this._reactMap.get(w)));

        for (const list of reactLists) {
            const emoji = ReactionHandler._getEmoji(list);

            if (typeof emoji !== "undefined") {
                await msg.react(emoji);
            }
        }
    }

    async _multipleReact(msg, words) {
        const emojis = new Set();

        for (const [word, count] of Object.entries(words)) {
            const reactList = this._reactMap.get(word),
                samples = Array.from({ length: count }, () => ReactionHandler._getEmoji(reactList));

            samples.forEach(emoji => typeof emoji !== "undefined" && emojis.add(emoji));
        }

        await Promise.all(emojis.map(emoji => msg.react(emoji)));
    }

    async _funnyReact(content, msg) {
        const t1 = performance.now();

        const words = this._getWordCounts(content);

        if (words === null) {
            return false;
        }

        logWordsUsage(msg, Object.keys(words));

        let reactFunc;

        if (this.multipleReacts) {
            reactFunc = this._multipleReact;
        } else {
            reactFunc = this._singleReact;
        }

        try {
            await reactFunc.call(this, msg, words);
        } catch (err) {
            getLogger().error("Failed to react to message:", err);
        }

        logReactTime(t1);
        return true;
    }
}

export default ReactionHandler;
