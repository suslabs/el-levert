import { AxiosError } from "axios";
import { bold, EmbedBuilder, escapeMarkdown, hideLinkEmbed, inlineCode, italic } from "discord.js";

import NomiCodexClient from "../../ai/sources/NomiCodexClient.js";

import { OverclockingValues } from "../../structures/OverclockingValues.js";

import { getEmoji } from "../../LevertClient.js";

import Util from "../Util.js";
import ArrayUtil from "../ArrayUtil.js";
import DiscordUtil from "../DiscordUtil.js";
import ObjectUtil from "../ObjectUtil.js";
import ListDetailView from "./ListDetailView.js";
import PaginationUtil from "./PaginationUtil.js";
import HTMLUtil from "../misc/HTMLUtil.js";

import AIError from "../../errors/AIError.js";

function formatText(html, limit) {
    const str = HTMLUtil.stripTags(html);
    return escapeMarkdown(typeof limit === "number" ? Util.trimString(str, limit, null, { tight: true }) : str);
}

function formatStats(eu, dur, tier) {
    const time = Number.isFinite(dur) ? `${dur / OverclockingValues.ticksPerSecond}s` : "";

    return [
        Number.isFinite(eu) && eu !== 0 && `${eu} EU/t`,
        time && `${time}${tier && tier !== "?" ? ` (${formatText(tier, 12)})` : ""}`
    ].filter(Boolean);
}

function formatVariants(recipe, limit) {
    const variants = recipe.variants ?? [];

    if (Util.empty(variants)) {
        return "";
    }

    const machines = ArrayUtil.unique(
        variants.map(variant => variant.type).filter(type => type && type !== recipe.type)
    );

    return Util.empty(machines)
        ? `+${variants.length} variant${Util.single(variants) ? "" : "s"}`
        : `also ${formatText(machines.join(", "), limit)}`;
}

class RecipeView {
    static cardTimeout = 11 / Util.durationSeconds.milli;
    static color = 0xa78bfa;
    static siteUrl = "https://sayaisha.github.io/NomiCodex";
    static packVersion = "NomiFactory CEu 1.7.7";

    static notice(description) {
        return { embeds: [RecipeView._createEmbed().setDescription(description)] };
    }

    static help(command) {
        return RecipeView.notice(
            [
                "**Search & view**",
                `${inlineCode(`${command} <item>`)} — list an item's recipes`,
                `${inlineCode(`${command} <item> <machine>`)} — filter by machine (EBF, LCR, mixer, …)`,
                "",
                "**Uses**",
                `${inlineCode(`${command} <item> --uses`)} — recipes that consume the item`,
                "",
                "**Options**",
                "`--expert` hard mode • `--light` light card • `--list` always list",
                "",
                "**Pagination**",
                `${inlineCode("--page <num>")}, ${inlineCode("--limit <num>")}, ${inlineCode("--all")}`
            ].join("\n")
        );
    }

    constructor(source, data, options) {
        options = ObjectUtil.guaranteeObject(options);

        const query = options.query ?? "",
            number = options.number ?? null;

        const uses = options.uses ?? false,
            list = options.list ?? false;

        const mode = options.mode ?? source.mode,
            light = options.light ?? false;

        this.source = source;
        this.data = data;
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
                `:mag: No item found for ${inlineCode(formatText(this.query, 200))}${this._alternatives()}`
            );
        }

        const entries = (this.uses ? this.data.uses : this.data.recipes) ?? [];

        if (Util.empty(entries)) {
            return this._renderEmpty(item);
        }

        const count = entries.length;

        const limits = ctx.handler?.getLimits().embed ?? [DiscordUtil.embedCharLimit];

        const { all } = PaginationUtil.getPaginationOptions(ctx);

        if (!this.list && this.number !== null) {
            const entry = entries[this.number - 1];

            if (typeof entry === "undefined") {
                return RecipeView.notice(`${getEmoji("warn")} ${this.label} number must be 1–${count}.`);
            }

            return await this._renderItem(item, { entry, number: this.number }, count, limits);
        } else if (!this.list && !all && !this.uses && Util.single(entries)) {
            return await this._renderItem(item, { entry: Util.first(entries), number: 1 }, count, limits);
        }

        const items = entries.map((entry, i) => ({ entry, number: i + 1 }));

        return await PaginationUtil.paginate(ctx, {
            items,
            maxLimit: ListDetailView.maxLimit,
            render: (results, info) => this._renderList(item, results, info, limits),
            controls: ListDetailView.createPicker(result => this._renderItem(item, result, count, limits), {
                getLabel: result => result.number
            }),

            dumpHeader: bold(this._title(item.name, true)),
            formatDump: allItems => this._formatLines(allItems).join("\n"),
            filename: "recipes.md"
        });
    }

    static _createEmbed() {
        return new EmbedBuilder().setColor(RecipeView.color);
    }

    _alternatives(machine = null) {
        const names = (this.data.alternatives ?? [])
            .filter(alt => machine === null || alt.hasMachine)
            .slice(0, 5)
            .map(alt => bold(formatText(alt.name, 100)));

        if (Util.empty(names)) {
            return "";
        } else if (machine !== null) {
            return `\nThese have ${machine} recipes: ${names.join(", ")}.`;
        }

        return `\nDid you mean: ${names.join(", ")}`;
    }

    _renderEmpty(item) {
        const name = bold(formatText(item.name, 200)),
            machine = this.data.machineFilter;

        let description;

        if (this.uses) {
            description = `${name} isn't used as an input in any indexed recipe.`;
        } else if (machine) {
            const machineName = formatText(machine, 100);

            const types = formatText((item.types ?? []).join(", "), 600),
                available = Util.empty(types) ? "" : `\nIt has recipes in: ${types}.`;

            description = `${name} has no ${bold(machineName)} recipes.${available}${this._alternatives(machineName)}`;
        } else {
            description = `${name} has no listed recipes.`;
        }

        return RecipeView.notice(`${getEmoji("info")} ${description}`);
    }

    _describeRecipe(recipe, limit) {
        const name = recipe.itemName ? ` → ${bold(formatText(recipe.itemName, limit))}` : "",
            summary = [
                `${formatText(recipe.type, limit)}${name}`,
                ...formatStats(recipe.eu, recipe.dur, recipe.tier),
                recipe.heat > 0 && `${recipe.heat}K`,
                recipe.clean && "cleanroom",
                formatVariants(recipe, limit)
            ]
                .filter(Boolean)
                .join(" • ");

        const inputs = recipe.ins ? `from ${bold(formatText(recipe.ins, limit))}` : "",
            outputs = recipe.outs ? `→ ${bold(formatText(recipe.outs, limit))}` : "",
            io = [inputs, outputs].filter(Boolean).join(" ");

        return Util.empty(io) ? summary : `${summary}\n  ${io}`;
    }

    _describeUse(use, limit) {
        const summary = [
            `makes ${bold(formatText(use.n, limit))} — ${formatText(use.t, limit)}`,
            ...formatStats(use.e, use.d)
        ].join(" • ");

        const inputs = use.i ? ` from ${bold(formatText(use.i, limit))}` : "";

        return `${summary}${inputs}`;
    }

    _describeEntry(entry, limit) {
        return this.uses ? this._describeUse(entry, limit) : this._describeRecipe(entry, limit);
    }

    _machineSuffix() {
        const machine = this.data.machineFilter;
        return !this.uses && machine ? ` (${formatText(machine, 60)})` : "";
    }

    _title(name, showMachine = false) {
        const prefix = this.uses ? "Uses: " : "",
            suffix = showMachine ? this._machineSuffix() : "",
            limit = DiscordUtil.embedLimits.title - prefix.length - suffix.length;

        name = Util.trimString(formatText(name), limit, null, { tight: true });
        return `${prefix}${name}${suffix}`;
    }

    _result(title, description, [total, totalLines]) {
        const embed = RecipeView._createEmbed().setTitle(title).setFooter({ text: this.footer });

        const payload = { embeds: [embed] };

        if (DiscordUtil.embedComponentsOverSizeLimit({ ...embed.data, description }, { total, totalLines })) {
            Object.assign(payload, DiscordUtil.getFileAttach(description, "recipes.md"));
        } else if (!Util.empty(description)) {
            embed.setDescription(description);
        }

        return payload;
    }

    _formatLines(results) {
        return results.map(({ entry, number }) => `${inlineCode(number)} ${this._describeEntry(entry, 100)}`);
    }

    _renderList(item, results, info, limits) {
        const { page, totalPages, totalCount } = info;

        const lines = this._formatLines(results);

        if (totalPages > 1 && this.uses) {
            const last = results.at(-1).number,
                shown = page === 1 ? last : `${Util.first(results).number}–${last}`;

            lines.push(`… showing ${shown} of ${totalCount}`);
        } else if (totalPages > 1) {
            lines.push(`… page ${page} of ${totalPages} (${totalCount} recipes)`);
        }

        if (!this.uses && this.data.hotChain && this.data.machineFilter) {
            const machine = formatText(this.data.machineFilter, 60);
            lines.push(italic(`${getEmoji("info")} Showing the hot ingot — the ${machine} step.`));
        }

        return this._result(this._title(item.name, true), lines.join("\n"), limits);
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

        const title = this._title(entry.itemName ?? item.name);

        const name = bold(formatText(item.name, 200)),
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

        const payload = this._result(title, description, limits);

        if (url !== null) {
            Util.first(payload.embeds).setImage(url);
        }

        return payload;
    }
}

export default RecipeView;
