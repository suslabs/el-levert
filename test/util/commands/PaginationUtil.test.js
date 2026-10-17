import { describe, expect, test, vi } from "vitest";
import { EmbedBuilder } from "discord.js";

import PaginationUtil from "../../../src/util/commands/PaginationUtil.js";
import DiscordUtil from "../../../src/util/DiscordUtil.js";

describe("PaginationUtil", () => {
    test("getPaginationArguments provides page, limit, and all options", () => {
        const args = PaginationUtil.getPaginationArguments({ defaultLimit: 5 });

        expect(args).toHaveLength(3);

        const [pageArg, limitArg, allArg] = args;

        expect(pageArg.name).toBe("page");
        expect(pageArg.type).toBe("integer");
        expect(pageArg.aliases).toContain("p");

        expect(limitArg.name).toBe("limit");
        expect(limitArg.type).toBe("integer");
        expect(limitArg.defaultValue).toBe(5);
        expect(limitArg.aliases).toContain("l");

        expect(allArg.name).toBe("all");
        expect(allArg.type).toBe("boolean");
        expect(allArg.aliases).toContain("a");
    });

    test("getPaginationOptions resolves options from context", () => {
        const mockCtx = {
            commandName: "list",
            arg: name => {
                switch (name) {
                    case "page":
                        return 2;
                    case "limit":
                        return 15;
                    case "all":
                        return false;
                    default:
                        return undefined;
                }
            }
        };

        const opts = PaginationUtil.getPaginationOptions(mockCtx, { defaultLimit: 10, maxLimit: 50 });

        expect(opts.page).toBe(2);
        expect(opts.limit).toBe(15);
        expect(opts.offset).toBe(15);
        expect(opts.all).toBe(false);
    });

    test("getPaginationOptions detects _all alias in commandName", () => {
        const mockCtx = {
            commandName: "list_all",
            arg: () => undefined
        };

        const opts = PaginationUtil.getPaginationOptions(mockCtx);
        expect(opts.all).toBe(true);
    });

    test("createPaginationRow generates standard 5-button row with correct bounds", () => {
        const firstPageRow = PaginationUtil.createPaginationRow("sess1", 1, 5);
        const firstRowData = firstPageRow.toJSON();

        expect(firstRowData.components).toHaveLength(5);
        expect(firstRowData.components[0].disabled).toBe(true);
        expect(firstRowData.components[1].disabled).toBe(true);
        expect(firstRowData.components[2].disabled).toBe(false);
        expect(firstRowData.components[2].label).toBe("1 / 5");
        expect(firstRowData.components[2].custom_id).toBe("page:jump:sess1");
        expect(firstRowData.components[3].disabled).toBe(false);
        expect(firstRowData.components[4].disabled).toBe(false);

        const midPageRow = PaginationUtil.createPaginationRow("sess1", 3, 5);
        const midRowData = midPageRow.toJSON();

        expect(midRowData.components[0].disabled).toBe(false);
        expect(midRowData.components[1].disabled).toBe(false);
        expect(midRowData.components[2].label).toBe("3 / 5");
        expect(midRowData.components[2].disabled).toBe(false);
        expect(midRowData.components[2].custom_id).toBe("page:jump:sess1");
        expect(midRowData.components[3].disabled).toBe(false);
        expect(midRowData.components[4].disabled).toBe(false);

        const lastPageRow = PaginationUtil.createPaginationRow("sess1", 5, 5);
        const lastRowData = lastPageRow.toJSON();

        expect(lastRowData.components[0].disabled).toBe(false);
        expect(lastRowData.components[1].disabled).toBe(false);
        expect(lastRowData.components[2].label).toBe("5 / 5");
        expect(lastRowData.components[2].disabled).toBe(false);
        expect(lastRowData.components[2].custom_id).toBe("page:jump:sess1");
        expect(lastRowData.components[3].disabled).toBe(true);
        expect(lastRowData.components[4].disabled).toBe(true);

        const singlePageRow = PaginationUtil.createPaginationRow("sess1", 1, 1);
        const singleRowData = singlePageRow.toJSON();

        expect(singleRowData.components.every(c => c.disabled)).toBe(true);
    });

    test("dumpAll generates embed when output fits within limit", async () => {
        const mockCtx = {
            handler: {
                getLimits: () => ({
                    embed: [4096, null]
                })
            }
        };

        const res = await PaginationUtil.dumpAll(mockCtx, {
            items: ["one", "two", "three"],
            formatDump: items => items.join("\n"),
            dumpHeader: "All items:"
        });

        expect(res.content).toBe("All items:");
        expect(res.embeds).toHaveLength(1);
        expect(res.embeds[0].data.description).toBe("one\ntwo\nthree");
        expect(res.files).toBeUndefined();
    });

    test("dumpAll generates file attachment when output exceeds limit", async () => {
        const mockCtx = {
            handler: {
                getLimits: () => ({
                    embed: [50, null]
                })
            }
        };

        const longText = "A".repeat(100);

        const res = await PaginationUtil.dumpAll(mockCtx, {
            items: [longText],
            formatDump: items => items.join("\n"),
            dumpHeader: "All items:",
            filename: "export.txt"
        });

        expect(res.content).toBe("All items:");
        expect(res.files).toHaveLength(1);
        expect(res.files[0].name).toBe("export.txt");
    });

    test("dumpAll requests discord = false formatting when output exceeds embed limits", async () => {
        const mockCtx = {
            handler: {
                getLimits: () => ({
                    embed: [50, null]
                })
            }
        };

        const formatSpy = vi.fn((items, discord) => (discord ? "**" + "A".repeat(100) + "**" : "A".repeat(100)));

        const res = await PaginationUtil.dumpAll(mockCtx, {
            items: ["item"],
            formatDump: formatSpy,
            dumpHeader: "All items:",
            filename: "export.txt"
        });

        expect(formatSpy).toHaveBeenCalledWith(["item"], true, mockCtx);
        expect(formatSpy).toHaveBeenCalledWith(["item"], false, mockCtx);
        expect(res.content).toBe("All items:");
        expect(res.files).toHaveLength(1);
        expect(res.files[0].attachment.toString()).toBe("A".repeat(100));
    });

    test("paginate detects oversized embed on rendered page and converts to file attachment", async () => {
        const mockCtx = {
            arg: () => undefined,
            handler: {
                getLimits: () => ({
                    embed: [50, null]
                })
            }
        };

        const res = await PaginationUtil.paginate(mockCtx, {
            items: ["item1"],
            defaultLimit: 10,
            render: () => ({
                content: "Header:",
                embeds: [new EmbedBuilder().setDescription("B".repeat(100))]
            }),
            formatDump: (items, discord) => (discord ? "**item1**" : "item1"),
            filename: "page.txt"
        });

        expect(res.content).toBe("Header:");
        expect(res.files).toHaveLength(1);
        expect(res.files[0].name).toBe("page.txt");
        expect(res.files[0].attachment.toString()).toBe("item1");
    });

    test("handleInteraction advances session.page for author", async () => {
        const updateSpy = vi.fn();
        const mainSession = {
            id: "sess1",
            authorId: "user1",
            page: 1,
            totalPages: 5,
            pageSize: 10,
            totalCount: 50,
            spec: {
                render: items => ({ content: `Page content with ${items.length} items` })
            },
            context: { page: 1 }
        };

        const ctx = {
            isAuthor: true,
            paginationSession: mainSession,
            paginationSpec: mainSession.spec,
            interaction: {
                customId: "page:next:sess1",
                isRepliable: () => true
            },
            update: updateSpy
        };

        const handled = await PaginationUtil.handleInteraction(ctx);

        expect(handled).toBe(true);
        expect(mainSession.page).toBe(2);
        expect(mainSession.context.page).toBe(2);
        expect(updateSpy).toHaveBeenCalledOnce();
    });

    test("handleInteraction does not mutate main session.page on ephemeral non-author interaction", async () => {
        const replySpy = vi.fn();
        const updateSpy = vi.fn();
        const mainSession = {
            id: "main_sess",
            authorId: "author_user",
            page: 1,
            totalPages: 5,
            pageSize: 10,
            totalCount: 50,
            spec: {
                items: Array.from({ length: 50 }, (_, i) => `item ${i + 1}`),
                render: items => ({ content: `Page content: ${items.length}` })
            },
            context: { page: 1 }
        };

        const ctx = {
            isAuthor: false,
            isInteraction: true,
            paginationSession: mainSession,
            paginationSpec: mainSession.spec,
            interaction: {
                customId: "page:next:main_sess",
                user: { id: "other_user" },
                isRepliable: () => true
            },
            clone: overrides => ({
                ...ctx,
                ...overrides
            }),
            reply: replySpy,
            update: updateSpy
        };

        const handled = await PaginationUtil.handleInteraction(ctx);

        expect(handled).toBe(true);
        // The main session must NOT be mutated by ephemeral interactions!
        expect(mainSession.page).toBe(1);
        expect(mainSession.context.page).toBe(1);
        expect(updateSpy).not.toHaveBeenCalled();
        expect(replySpy).toHaveBeenCalledOnce();
        expect(replySpy.mock.calls[0][1]).toEqual({ ephemeral: true });
    });
});
