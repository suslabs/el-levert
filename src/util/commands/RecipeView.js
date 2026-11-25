import { AxiosError } from "axios";
import { bold, EmbedBuilder, escapeMarkdown, inlineCode, italic } from "discord.js";

import NomiCodexClient from "../../ai/sources/NomiCodexClient.js";
import PickerUtil from "./PickerUtil.js";

import { OverclockingValues } from "../../structures/OverclockingValues.js";

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
    static sourceName = "NomiCodex";

    static notice(description, footer = RecipeView.sourceName) {
        return { embeds: [RecipeView._createEmbed(footer).setDescription(description)] };
    }

    static help(command) {
        return RecipeView.notice(
            [
                "**Search & view**",
                `${inlineCode(`${command} <item>`)} — list an item's recipes`,
                `${inlineCode(`${command} <item> <machine>`)} — filter by machine (EBF, LCR, Mixer)`,
                `${inlineCode(`${command} <item> [machine] <number>`)} — open a recipe card`,
                "",
                "**Uses**",
                `${inlineCode(`${command} <item> --uses`)} — list recipes that consume the item`,
                `${inlineCode(`${command} <item> --uses <number>`)} — open a use card`,
                "",
                "**Navigation**",
                "Select a number to open a result. Use **Back** to return to the list.",
                `${inlineCode("--page <number>")} — start on a specific page`,
                "",
                "**Options**",
                "`--expert` expert mode • `--light` light card • `--list` always list"
            ].join("\n")
        );
    }

    constructor(source, data, options) {
        options = ObjectUtil.guaranteeObject(options);

        this.source = source;
        this.data = data;
        this.query = options.query ?? "";
        this.number = options.number ?? null;
        this.mode = data.mode ?? options.mode ?? source.mode;
        this.uses = options.uses ?? false;
        this.list = options.list ?? false;
        this.theme = options.light ? "light" : null;

        this.label = this.uses ? "Use" : "Recipe";
        this.footer = `${RecipeView.sourceName} • ${this.mode} mode`;
    }

    async reply(ctx) {
        const { item, error } = this.data;

        if (error === NomiCodexClient.notFoundError || item == null) {
            return RecipeView.notice(
                `:mag: No item found for ${inlineCode(this._text(this.query, 200))}${this._alternatives()}`,
                this.footer
            );
        }

        const entries = (this.uses ? this.data.uses : this.data.recipes) ?? [];

        if (Util.empty(entries)) {
            return this._renderEmpty(item);
        }

        const items = entries.map((entry, i) => ({ entry, number: i + 1 }));
        const limits = ctx.handler?.getLimits().embed ?? [DiscordUtil.embedCharLimit];

        if (!this.list && this.number !== null) {
            const selected = items[this.number - 1];

            if (typeof selected === "undefined") {
                return RecipeView.notice(
                    `${getEmoji("warn")} ${this.label} number must be 1–${items.length}.`,
                    this.footer
                );
            }

            return await this._renderItem(item, selected, items.length, limits);
        } else if (!this.list && !this.uses && Util.single(items)) {
            return await this._renderItem(item, Util.first(items), items.length, limits);
        }

        return await PickerUtil.pick(ctx, {
            items,
            getLabel: result => result.number,
            renderList: (results, info) => this._renderList(item, results, info, limits),
            renderItem: result => this._renderItem(item, result, items.length, limits)
        });
    }

    static _createEmbed(footer) {
        return new EmbedBuilder().setColor(RecipeView.color).setFooter({ text: footer });
    }

    _text(html, limit) {
        const str = HTMLUtil.stripTags(html);
        return escapeMarkdown(typeof limit === "number" ? Util.trimString(str, limit, null, { tight: true }) : str);
    }

    _alternatives(machineOnly = false) {
        const names = (this.data.alternatives ?? [])
            .filter(alt => !machineOnly || alt.hasMachine)
            .slice(0, 5)
            .map(alt => bold(this._text(alt.name, 100)));

        return Util.empty(names)
            ? ""
            : `\n${machineOnly ? "Items with matching recipes" : "Did you mean"}: ${names.join(", ")}`;
    }

    _renderEmpty(item) {
        const name = bold(this._text(item.name, 200));
        const machine = this.data.machineFilter;

        let description;

        if (this.uses) {
            description = `${name} isn't used as an input in any indexed recipe.`;
        } else if (machine) {
            const types = this._text((item.types ?? []).join(", "), 600);
            const available = Util.empty(types) ? "" : `\nIt has recipes in: ${types}.`;
            description = `${name} has no ${bold(this._text(machine, 100))} recipes.${available}${this._alternatives(true)}`;
        } else {
            description = `${name} has no listed recipes.`;
        }

        return RecipeView.notice(`${getEmoji("info")} ${description}`, this.footer);
    }

    _stats(eu, dur, tier) {
        const time = Number.isFinite(dur) ? `${Util.formatNumber(dur / OverclockingValues.ticksPerSecond, 2)}s` : "";

        return [
            Number.isFinite(eu) && eu !== 0 && `${Util.formatNumber(eu)} EU/t`,
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
            recipe.heat > 0 && `${Util.formatNumber(recipe.heat)}K`,
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

    _header(name, showMachine = false) {
        name = this._text(name, 200);
        const machine = showMachine && this.data.machineFilter ? ` (${this._text(this.data.machineFilter, 60)})` : "";
        return bold(this.uses ? `Uses: ${name}${machine}` : `${name}${machine}`);
    }

    _withDescription(content, description, footer, limits) {
        const embed = RecipeView._createEmbed(footer);
        const payload = { content, embeds: [embed] };

        if (
            Util.overSizeLimits(description, DiscordUtil.embedLimits.description) ||
            Util.overSizeLimits(`${description}\n${footer}`, ...limits)
        ) {
            Object.assign(payload, DiscordUtil.getFileAttach(description, "recipes.md"));
        } else if (!Util.empty(description)) {
            embed.setDescription(description);
        }

        return payload;
    }

    _renderList(item, results, info, limits) {
        const lines = results.map(({ entry, number }) => `${inlineCode(number)} ${this._describeEntry(entry, 100)}`);

        if (info.totalPages > 1) {
            lines.push(`… page ${info.page} of ${info.totalPages} (${info.totalCount} ${this.label.toLowerCase()}s)`);
        }

        if (this.data.hotChain && this.data.machineFilter) {
            lines.push(
                italic(
                    `${getEmoji("info")} Showing the hot ingot — the ${this._text(this.data.machineFilter, 60)} step.`
                )
            );
        }

        lines.push("", italic("Select a number below to view it."));
        return this._withDescription(this._header(item.name, true), lines.join("\n"), this.footer, limits);
    }

    async _renderItem(item, result, count, limits) {
        const { entry, number } = result;

        const content = this._header(entry.itemName ?? item.name);
        const name = bold(this._text(item.name, 200)),
            separator = this.uses ? " " : " — ";

        const machine = this.data.machineFilter ? ` (${this._text(this.data.machineFilter, 60)})` : "",
            position = italic(`${this.label.toLowerCase()} ${number} of ${count}${machine} • ${this.mode} mode`);

        const description = `${name}${separator}${this._describeEntry(entry)}\n${position}`,
            payload = this._withDescription(content, description, this.footer, limits);

        try {
            const url = await this.source.renderCard(
                entry.itemId ?? item.id,
                this.uses ? 0 : (entry.idx ?? number - 1),
                {
                    mode: this.mode,
                    theme: this.theme,
                    machine: entry.idx == null ? this.data.machineFilter : null,
                    use: this.uses ? entry : null,
                    timeout: RecipeView.cardTimeout
                }
            );

            const embed = Util.first(payload.embeds);
            embed.setImage(url);
        } catch (err) {
            if (!(err instanceof AIError || err instanceof AxiosError)) {
                throw err;
            }
        }

        return payload;
    }
}

export default RecipeView;
