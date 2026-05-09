import { ChannelType } from "discord.js";

import Handler from "../Handler.js";
import ReactionTracker from "./tracker/ReactionTracker.js";

import { getClient, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ArrayUtil from "../../util/ArrayUtil.js";
import RegexUtil from "../../util/misc/RegexUtil.js";
import DiscordUtil from "../../util/DiscordUtil.js";
import Benchmark from "../../util/misc/Benchmark.js";

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

function logReactTime(timeKey) {
    if (!getLogger().isDebugEnabled()) {
        Benchmark.stopTiming(timeKey, null);
        return;
    }

    const elapsed = Benchmark.stopTiming(timeKey, false);
    getLogger().debug(`Reacting took ${Util.formatNumber(elapsed)} ms.`);
}

function logRemove(msg) {
    getLogger().isDebugEnabled() &&
        getLogger().debug(
            `Removing reactions from message ${msg.id} sent by user ${msg.author.id} (${msg.author.username}) in channel ${msg.channel.id} (${DiscordUtil.formatChannelName(msg.channel)}).`
        );
}

function logRemoveTime(timeKey) {
    if (!getLogger().isDebugEnabled()) {
        Benchmark.stopTiming(timeKey, null);
        return;
    }

    const elapsed = Benchmark.stopTiming(timeKey, false);
    getLogger().debug(`Removing reactions took ${Util.formatNumber(elapsed)} ms.`);
}

class ReactionHandler extends Handler {
    static $name = "reactionHandler";
    priority = -1;

    static emoticonEyeChars = ":;=8xX";
    static emoticonNoseChars = "-^'oO*";

    static _parenEmoticonRegex = new RegExp(
        `(?:[<>]?[${RegexUtil.escapeCharClass(this.emoticonEyeChars)}][${RegexUtil.escapeCharClass(
            this.emoticonNoseChars
        )}]?[()]+|[()]+[${RegexUtil.escapeCharClass(this.emoticonNoseChars)}]?[${RegexUtil.escapeCharClass(
            this.emoticonEyeChars
        )}]>?)`,
        "g"
    );

    constructor(enabled) {
        super(enabled);

        this.multipleReacts = getClient().reactions.multipleReacts ?? false;

        this.reactionTracker = new ReactionTracker(20);
    }

    async react(msg, emoji) {
        if (emoji == null) {
            return;
        }

        const react = await msg.react(emoji);
        this.reactionTracker.addReaction(msg, react);
    }

    async removeReacts(msg) {
        logRemove(msg);
        const timeKey = Benchmark.startTiming(Symbol("reaction_remove"));

        let botId = getClient().client.user.id;
        await this.reactionTracker.deleteWithCallback(msg, "reaction", react => react.users.remove(botId));

        logRemoveTime(timeKey);
    }

    async execute(msg) {
        if (msg.channel.type === ChannelType.DM) {
            return false;
        }

        const timeKey = Benchmark.startTiming(Symbol("reaction_execute"));

        const plan = this._getReactionPlan(msg.content);

        if (plan.words.length > 0) {
            logWordsUsage(msg, plan.words);
        }

        if (plan.parens.total > 0) {
            logParensUsage(msg, plan.parens);
        }

        const reacted = await this._reactWithPlan(msg, plan);

        if (reacted) {
            logReactTime(timeKey);
        } else {
            Benchmark.stopTiming(timeKey, null);
        }

        return reacted;
    }

    async resubmit(msg) {
        if (msg.channel.type === ChannelType.DM) {
            return false;
        }

        const timeKey = Benchmark.startTiming(Symbol("reaction_resubmit"));

        const plan = this._getReactionPlan(msg.content),
            diff = this._getReactionDiff(msg, plan.emojis);

        if (plan.words.length > 0 && diff.added.length > 0) {
            logWordsUsage(msg, plan.words);
        }

        if (plan.parens.total > 0 && diff.added.length > 0) {
            logParensUsage(msg, plan.parens);
        }

        const reacted = await this._reactWithDiff(msg, diff);

        if (reacted) {
            logReactTime(timeKey);
        } else {
            Benchmark.stopTiming(timeKey, null);
        }

        return reacted;
    }

    load() {
        this._setWords();
        this._setParens();
    }

    static _getEmoji(reactList) {
        return Util.single(reactList) ? Util.first(reactList) : Util.randomElement(reactList);
    }

    static _toStringArray(value) {
        return ArrayUtil.guaranteeArray(value, undefined, true).filter(Util.nonemptyString);
    }

    static _getReactionEmoji(reaction) {
        if (reaction == null) {
            return null;
        }

        if (typeof reaction === "string") {
            return reaction;
        }

        const emoji = reaction.emoji ?? reaction;

        if (typeof emoji === "string") {
            return emoji;
        }

        if (Util.nonemptyString(emoji?.name)) {
            return emoji.id == null ? emoji.name : `${emoji.name}:${emoji.id}`;
        }

        if (Util.nonemptyString(emoji?.id)) {
            return emoji.id;
        }

        return null;
    }

    static _getReactMap(funnyWords) {
        const reactMap = new Map();

        for (const elem of funnyWords) {
            const words = ReactionHandler._toStringArray(elem.word ?? elem.words).map(word =>
                    normalizeText(word).trim()
                ),
                emojis = ReactionHandler._toStringArray(elem.emoji ?? elem.emojis);

            if (words.length < 1 || emojis.length < 1) {
                continue;
            }

            for (const word of words) {
                if (Util.nonemptyString(word)) {
                    reactMap.set(word, emojis);
                }
            }
        }

        return reactMap;
    }

    _setWords() {
        this.funnyWords = getClient().reactions.funnyWords;

        this._reactMap = ReactionHandler._getReactMap(this.funnyWords);
        this._wordList = [...this._reactMap.keys()];
        this._wordRegex = RegexUtil.getWordRegex(this._wordList);
    }

    _setParens() {
        const parens = getClient().reactions.parens;
        const left = ReactionHandler._toStringArray(parens?.left),
            right = ReactionHandler._toStringArray(parens?.right);

        this.enableParens = left.length > 0 || right.length > 0;
        this.parens = { left, right };
    }

    _getVisibleContent(content) {
        return DiscordUtil.maskCodeblocks(content);
    }

    _getWordMatches(str) {
        if (this._wordRegex == null) {
            return [];
        }

        const seenWords = new Set(),
            matches = [];

        str = normalizeText(str);
        this._wordRegex.lastIndex = 0;

        for (const match of str.matchAll(this._wordRegex)) {
            const word = match[0];

            if (!this.multipleReacts && seenWords.has(word)) {
                continue;
            }

            seenWords.add(word);
            matches.push({
                index: match.index,
                word,
                emojis: this._reactMap.get(word)
            });
        }

        return matches;
    }

    _getWordCounts(str) {
        const counts = {};

        for (const { word } of this._getWordMatches(str)) {
            counts[word] = (counts[word] ?? 0) + 1;
        }

        return Util.empty(Object.keys(counts)) ? null : counts;
    }

    _getParenReactionInfo(str) {
        const info = {
            left: 0,
            right: 0,
            total: 0,
            hits: []
        };

        if (!this.enableParens || (!str.includes("(") && !str.includes(")"))) {
            return info;
        }

        ReactionHandler._parenEmoticonRegex.lastIndex = 0;
        const clean = str.replace(ReactionHandler._parenEmoticonRegex, match => match.replace(/[()]/g, " "));

        const unmatchedLeft = [],
            unmatchedRight = [];

        for (let i = 0; i < clean.length; i++) {
            const char = clean[i];

            if (char === "(") {
                unmatchedLeft.push(i);
            } else if (char === ")") {
                if (unmatchedLeft.length > 0) {
                    unmatchedLeft.pop();
                } else {
                    unmatchedRight.push(i);
                }
            }
        }

        info.left = Util.clamp(unmatchedLeft.length, 0, this.parens.right.length);
        info.right = Util.clamp(unmatchedRight.length, 0, this.parens.left.length);
        info.total = info.left + info.right;

        this.parens.left.slice(0, info.right).forEach((emoji, i) => {
            info.hits.push({
                index: unmatchedRight[i],
                emoji
            });
        });

        this.parens.right.slice(0, info.left).forEach((emoji, i) => {
            info.hits.push({
                index: unmatchedLeft[i],
                emoji
            });
        });

        return info;
    }

    _countUnmatchedParens(str) {
        const { left, right, total } = this._getParenReactionInfo(this._getVisibleContent(str));
        return { left, right, total };
    }

    _getReactionPlan(content, options = {}) {
        const visibleContent = this._getVisibleContent(content),
            includeWords = options.words ?? true,
            includeParens = options.parens ?? true;

        const wordMatches = includeWords ? this._getWordMatches(visibleContent) : [],
            parens = includeParens
                ? this._getParenReactionInfo(visibleContent)
                : { left: 0, right: 0, total: 0, hits: [] },
            planned = [];

        wordMatches.forEach(match => {
            planned.push({
                index: match.index,
                emoji: ReactionHandler._getEmoji(match.emojis),
                word: match.word
            });
        });

        parens.hits.forEach(hit => planned.push(hit));
        planned.sort((a, b) => a.index - b.index);

        const seenEmojis = new Set(),
            emojis = [];

        for (const { emoji } of planned) {
            if (emoji == null || seenEmojis.has(emoji)) {
                continue;
            }

            seenEmojis.add(emoji);
            emojis.push(emoji);
        }

        return {
            emojis,
            words: ArrayUtil.unique(wordMatches.map(match => match.word)),
            parens: {
                left: parens.left,
                right: parens.right,
                total: parens.total
            }
        };
    }

    _getTrackedReactions(msg) {
        return this.reactionTracker.getData(msg).reactions;
    }

    _getReactionDiff(msg, nextEmojis) {
        const trackedReactions = this._getTrackedReactions(msg),
            { removed, added } = ArrayUtil.diff(trackedReactions, nextEmojis, ReactionHandler._getReactionEmoji);

        return {
            removed,
            added
        };
    }

    async _reactWithPlan(msg, plan) {
        if (plan.emojis.length < 1) {
            return false;
        }

        try {
            await Promise.all(plan.emojis.map(emoji => this.react(msg, emoji)));
        } catch (err) {
            getLogger().error("Failed to react to message:", err);
        }

        return true;
    }

    async _reactWithDiff(msg, diff) {
        const hasRemoved = diff.removed.length > 0,
            hasAdded = diff.added.length > 0;

        if (!hasRemoved && !hasAdded) {
            return false;
        }

        if (hasRemoved) {
            logRemove(msg);
            const timeKey = Benchmark.startTiming(Symbol("reaction_diff_remove"));
            const botId = getClient().client.user.id;

            await Promise.all(
                diff.removed.map(reaction => {
                    this.reactionTracker.deleteReaction(msg, reaction);

                    const remove = reaction?.users?.remove;

                    if (typeof remove !== "function") {
                        return Promise.resolve(undefined);
                    }

                    return Promise.resolve(remove.call(reaction.users, botId)).catch(err => {
                        getLogger().error("Failed to remove reaction from message:", err);
                    });
                })
            );

            logRemoveTime(timeKey);
        }

        if (hasAdded) {
            await this._reactWithPlan(msg, { emojis: diff.added });
        }

        return true;
    }

    async _parensReact(content, msg) {
        const timeKey = Benchmark.startTiming(Symbol("reaction_parens"));

        const plan = this._getReactionPlan(content, {
                words: false,
                parens: true
            });

        if (plan.parens.total < 1) {
            Benchmark.stopTiming(timeKey, null);
            return false;
        }

        logParensUsage(msg, plan.parens);
        const reacted = await this._reactWithPlan(msg, plan);

        if (reacted) {
            logReactTime(timeKey);
        } else {
            Benchmark.stopTiming(timeKey, null);
        }

        return reacted;
    }

    async _funnyReact(content, msg) {
        const timeKey = Benchmark.startTiming(Symbol("reaction_words"));

        const plan = this._getReactionPlan(content, {
                words: true,
                parens: false
            });

        if (plan.words.length < 1) {
            Benchmark.stopTiming(timeKey, null);
            return false;
        }

        logWordsUsage(msg, plan.words);
        const reacted = await this._reactWithPlan(msg, plan);

        if (reacted) {
            logReactTime(timeKey);
        } else {
            Benchmark.stopTiming(timeKey, null);
        }

        return reacted;
    }
}

export default ReactionHandler;
