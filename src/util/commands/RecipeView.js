import { AxiosError } from "axios";
import { bold, EmbedBuilder, escapeInlineCode, escapeMarkdown, hideLinkEmbed, inlineCode, italic } from "discord.js";

import NomiCodexClient from "../../ai/sources/NomiCodexClient.js";
import PickerUtil from "./PickerUtil.js";

import { OverclockingValues } from "../../structures/OverclockingValues.js";

import PackModes from "../../structures/PackModes.js";

import { getEmoji } from "../../LevertClient.js";

import Util from "../Util.js";
import ArrayUtil from "../ArrayUtil.js";
import DiscordUtil from "../DiscordUtil.js";
import ObjectUtil from "../ObjectUtil.js";
import HTMLUtil from "../misc/HTMLUtil.js";

import AIError from "../../errors/AIError.js";

class RecipeView {
    static cardTimeout = 11 / Util.durationSeconds.milli;
    static color = 0xa78bfa;
    static siteUrl = "https://sayaisha.github.io/NomiCodex";
    static tagVersion = "rp v26";
    static packVersion = "NomiFactory CEu 1.7.7";

    static notice(description, footer = null) {
        return { embeds: [RecipeView._createEmbed(footer).setDescription(description)] };
    }

    static help(command) {
        return RecipeView.notice(
            [
                "**Search & view**",
                `${inlineCode(`${command} <item>`)} — list an item's recipes`,
                `${inlineCode(`${command} <item> <n>`)} — show recipe #n as a card`,
                `${inlineCode(`${command} <item> <machine>`)} — filter by machine (EBF, LCR, mixer, …)`,
                `${inlineCode(`${command} <item> <machine> <n>`)} — one recipe from that machine`,
                "",
                "**Uses**",
                `${inlineCode(`${command} <item> --uses`)} — recipes that consume the item`,
                `${inlineCode(`${command} <item> --uses <n>`)} — show one use`,
                "",
                "**Navigation**",
                "Select a number to open a result. Use **Back** to return to the list.",
                `${inlineCode(`${command} <item> --page 2`)} — jump to a page`,
                "",
                "**Options**",
                "`--expert` hard mode • `--light` light card • `--list` always list"
            ].join("\n"),
            `${RecipeView.tagVersion} • ${RecipeView.siteUrl}`
        );
    }

    constructor(source, data, command, options) {
        options = ObjectUtil.guaranteeObject(options);

        const query = options.query ?? "",
            number = options.number ?? null;

        const uses = options.uses ?? false,
            list = options.list ?? false;

        const mode = options.mode ?? source.mode,
            light = options.light ?? false;

        this.source = source;
        this.data = data;
        this.command = command;
        this.query = query;
        this.number = number;
        this.mode = data.mode ?? mode;
        this.uses = uses;
        this.list = list;
        this.theme = light ? "light" : null;

        this.label = this.uses ? "Use" : "Recipe";
        this.footer = `${RecipeView.packVersion} • ${this.mode} mode`;
    }

    async reply(ctx) {
        const { item, error } = this.data;

        if (error === NomiCodexClient.notFoundError || item == null) {
            return RecipeView.notice(
                `:mag: No item found for ${inlineCode(this._text(this.query, 200))}${this._alternatives()}`
            );
        }

        const entries = (this.uses ? this.data.uses : this.data.recipes) ?? [];

        if (Util.empty(entries)) {
            return this._renderEmpty(item);
        }

        const count = entries.length;

        const limits = ctx.handler?.getLimits().embed ?? [DiscordUtil.embedCharLimit];

        if (!this.list && this.number !== null) {
            const entry = entries[this.number - 1];

            if (typeof entry === "undefined") {
                return RecipeView.notice(`${getEmoji("warn")} ${this.label} number must be 1–${count}.`);
            }

            return await this._renderItem(item, { entry, number: this.number }, count, limits);
        } else if (!this.list && !this.uses && Util.single(entries)) {
            return await this._renderItem(item, { entry: Util.first(entries), number: 1 }, count, limits);
        }

        const items = entries.map((entry, i) => ({ entry, number: i + 1 }));

        const hotIngotHint = this.uses ? "" : this._hotIngotHint(entries);

        return await PickerUtil.pick(ctx, {
            items,
            getLabel: result => result.number,
            renderList: (results, info) => this._renderList(item, results, info, hotIngotHint, limits),
            renderItem: result => this._renderItem(item, result, count, limits)
        });
    }

    static _createEmbed(footer) {
        const embed = new EmbedBuilder().setColor(RecipeView.color);

        if (footer !== null) {
            embed.setFooter({ text: footer });
        }

        return embed;
    }

    _text(html, limit) {
        const str = HTMLUtil.stripTags(html);
        return escapeMarkdown(typeof limit === "number" ? Util.trimString(str, limit, null, { tight: true }) : str);
    }

    _alternatives(machine = null) {
        const names = (this.data.alternatives ?? [])
            .filter(alt => machine === null || alt.hasMachine)
            .slice(0, 5)
            .map(alt => bold(this._text(alt.name, 100)));

        if (Util.empty(names)) {
            return "";
        } else if (machine !== null) {
            return `\nThese have ${machine} recipes: ${names.join(", ")}.`;
        }

        return `\nDid you mean: ${names.join(", ")}`;
    }

    _commandFor(query, ...args) {
        const parts = [this.command, query, ...args];

        if (this.mode === PackModes.expert) {
            parts.push("--expert");
        }

        if (this.theme === "light") {
            parts.push("--light");
        }

        return inlineCode(escapeInlineCode(parts.join(" ")));
    }

    _renderEmpty(item) {
        const name = bold(this._text(item.name, 200));
        const machine = this.data.machineFilter;

        let description;

        if (this.uses) {
            description = `${name} isn't used as an input in any indexed recipe.`;
        } else if (machine) {
            const machineName = this._text(machine, 100);

            const types = this._text((item.types ?? []).join(", "), 600),
                available = Util.empty(types) ? "" : `\nIt has recipes in: ${types}.`;

            const command = this._commandFor(HTMLUtil.stripTags(item.name).toLowerCase());

            description = `${name} has no ${bold(machineName)} recipes.${available}${this._alternatives(machineName)}\n`;
            description += italic(`Use ${command} to list everything.`);
        } else {
            description = `${name} has no listed recipes.`;
        }

        return RecipeView.notice(`${getEmoji("info")} ${description}`);
    }

    _stats(eu, dur, tier) {
        const time = Number.isFinite(dur) ? `${dur / OverclockingValues.ticksPerSecond}s` : "";

        return [
            Number.isFinite(eu) && eu !== 0 && `${eu} EU/t`,
            time && `${time}${tier && tier !== "?" ? ` (${this._text(tier, 12)})` : ""}`
        ].filter(Boolean);
    }

    _variants(recipe, limit) {
        const variants = recipe.variants ?? [];

        if (Util.empty(variants)) {
            return "";
        }

        const machines = ArrayUtil.unique(
            variants.map(variant => variant.type).filter(type => type && type !== recipe.type)
        );

        return Util.empty(machines)
            ? `+${variants.length} variant${Util.single(variants) ? "" : "s"}`
            : `also ${this._text(machines.join(", "), limit)}`;
    }

    _describeRecipe(recipe, limit) {
        const name = recipe.itemName ? ` → ${bold(this._text(recipe.itemName, limit))}` : "";
        const summary = [
            `${this._text(recipe.type, limit)}${name}`,
            ...this._stats(recipe.eu, recipe.dur, recipe.tier),
            recipe.heat > 0 && `${recipe.heat}K`,
            recipe.clean && "cleanroom",
            this._variants(recipe, limit)
        ]
            .filter(Boolean)
            .join(" • ");

        const inputs = recipe.ins ? `from ${bold(this._text(recipe.ins, limit))}` : "",
            outputs = recipe.outs ? `→ ${bold(this._text(recipe.outs, limit))}` : "",
            io = [inputs, outputs].filter(Boolean).join(" ");

        return Util.empty(io) ? summary : `${summary}\n  ${io}`;
    }

    _describeUse(use, limit) {
        const summary = [
            `makes ${bold(this._text(use.n, limit))} — ${this._text(use.t, limit)}`,
            ...this._stats(use.e, use.d)
        ].join(" • ");
        const inputs = use.i ? ` from ${bold(this._text(use.i, limit))}` : "";

        return `${summary}${inputs}`;
    }

    _describeEntry(entry, limit) {
        return this.uses ? this._describeUse(entry, limit) : this._describeRecipe(entry, limit);
    }

    _machineSuffix() {
        const machine = this.data.machineFilter;
        return !this.uses && machine ? ` (${this._text(machine, 60)})` : "";
    }

    _header(name, showMachine = false) {
        name = this._text(name, 200);

        const machine = showMachine ? this._machineSuffix() : "";
        return bold(this.uses ? `Uses: ${name}` : `${name}${machine}`);
    }

    _navFooter(kind, number) {
        if (this.uses) {
            return this.footer;
        }

        const start = `${this.footer} ⟨rp:`,
            end = `|${kind}${number}⟩`,
            limit = DiscordUtil.embedLimits.footer - start.length - end.length;

        const query = this.query.replace(/[|⟨⟩\r\n]/g, " ").trim();

        return `${start}${Util.trimString(query, limit, null, { tight: true })}${end}`;
    }

    _withDescription(content, description, footer, [total, totalLines]) {
        const embed = RecipeView._createEmbed(footer);
        const payload = { content, embeds: [embed] };

        if (DiscordUtil.embedComponentsOverSizeLimit({ ...embed.data, description }, { total, totalLines })) {
            Object.assign(payload, DiscordUtil.getFileAttach(description, "recipes.md"));
        } else if (!Util.empty(description)) {
            embed.setDescription(description);
        }

        return payload;
    }

    _hotIngotHint(recipes) {
        if (recipes.some(recipe => recipe.role === "hot")) {
            return "";
        }

        for (const recipe of recipes) {
            const match = /\bHot ([^,(]+ Ingot)\b/.exec(HTMLUtil.stripTags(recipe.ins ?? ""));

            if (match !== null) {
                const command = this._commandFor(match[1].toLowerCase(), "ebf");
                return italic(`Smelted hot in the EBF: ${command}`);
            }
        }

        return "";
    }

    _renderList(item, results, info, hotIngotHint, limits) {
        const { page, totalPages, totalCount } = info;

        const lines = results.map(({ entry, number }) => `${inlineCode(number)} ${this._describeEntry(entry, 100)}`);

        if (totalPages > 1 && this.uses) {
            const last = results.at(-1).number,
                shown = page === 1 ? last : `${Util.first(results).number}–${last}`;

            lines.push(`… showing ${shown} of ${totalCount}`);
        } else if (totalPages > 1) {
            lines.push(`… page ${page} of ${totalPages} (${totalCount} recipes)`);
        }

        if (!this.uses && this.data.hotChain && this.data.machineFilter) {
            const machine = this._text(this.data.machineFilter, 60);
            lines.push(italic(`${getEmoji("info")} Showing the hot ingot — the ${machine} step.`));
        }

        if (!Util.empty(hotIngotHint)) {
            lines.push(hotIngotHint);
        }

        if (page < totalPages) {
            const next = page + 1;

            const args = this.uses ? ["--uses"] : [],
                command = this._commandFor(this.query, ...args, "--page", next);

            lines.push("", italic(`Use ${command} for page ${next}.`));
        }

        return this._withDescription(
            this._header(item.name, true),
            lines.join("\n"),
            this._navFooter("p", page),
            limits
        );
    }

    async _getCardUrl(entry, itemId, number) {
        try {
            return await this.source.renderCard(entry.itemId ?? itemId, this.uses ? 0 : (entry.idx ?? number - 1), {
                mode: this.mode,
                theme: this.theme,
                machine: entry.idx == null ? this.data.machineFilter : null,
                use: this.uses ? entry : null,
                timeout: RecipeView.cardTimeout
            });
        } catch (err) {
            if (err instanceof AIError || err instanceof AxiosError) {
                return null;
            }

            throw err;
        }
    }

    async _renderItem(item, result, count, limits) {
        const { entry, number } = result;

        const content = this._header(entry.itemName ?? item.name);

        const name = bold(this._text(item.name, 200)),
            separator = this.uses ? " " : " — ",
            position = italic(
                `${this.label.toLowerCase()} ${number} of ${count}${this._machineSuffix()} • ${this.mode} mode`
            );

        const url = await this._getCardUrl(entry, item.id, number);

        let description = `${name}${separator}${this._describeEntry(entry)}\n${position}`;

        if (url === null && !this.uses) {
            const link = hideLinkEmbed(`${RecipeView.siteUrl}/?item=${encodeURIComponent(item.id)}`);
            description += `\n:link: ${link}`;
        }

        const payload = this._withDescription(content, description, this._navFooter("r", number), limits);

        if (url !== null) {
            Util.first(payload.embeds).setImage(url);
        }

        return payload;
    }
}

export default RecipeView;
