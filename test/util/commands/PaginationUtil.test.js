import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { EmbedBuilder } from "discord.js";

import { cleanupRuntime, createRuntime } from "../../helpers/runtimeHarness.js";

import DiscordUtil from "../../../src/util/DiscordUtil.js";

let runtime;
let PaginationUtil;

beforeAll(async () => {
    runtime = await createRuntime({ loadHandlers: true, loadManagers: false, loadVMs: false });
    ({ default: PaginationUtil } = await import("../../../src/util/commands/PaginationUtil.js"));
});

afterAll(async () => {
    await cleanupRuntime(runtime);
});

function parsedArgs(values = {}) {
    return { results: new Map(Object.entries(values).map(([name, value]) => [name, { value }])) };
}

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
            parseArgs: () => parsedArgs({ page: 2, limit: 15, all: false })
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
            parseArgs: parsedArgs
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
            commandName: "list",
            parseArgs: parsedArgs,
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
            interactionContext: {
                session: mainSession,
                componentId: { prefix: "page", action: "next" },
                interaction: {
                    customId: "page:next:sess1",
                    isRepliable: () => true,
                    isModalSubmit: () => false
                }
            },
            update: updateSpy
        };

        const handled = await PaginationUtil.handleInteraction(ctx);

        expect(handled).toBe(true);
        expect(mainSession.page).toBe(2);
        expect(mainSession.context.page).toBe(2);
        expect(updateSpy).toHaveBeenCalledOnce();
    });

    test("uses supplied data only for its page and leaves the input spec intact", async () => {
        const ctx = {
            author: { id: "author" },
            commandName: "list",
            parseArgs: () => parsedArgs({ page: 2 }),
            reply: vi.fn()
        };
        const spec = {
            initialData: { page: 2, items: ["preloaded"], totalCount: 20 },
            fetch: vi.fn(),
            render: items => ({ content: items.join(", ") })
        };
        await PaginationUtil.paginate(ctx, spec);

        expect(ctx.reply).toHaveBeenCalledWith(expect.objectContaining({ content: "preloaded" }), {});
        expect(spec.fetch).not.toHaveBeenCalled();
        expect(spec.initialData.page).toBe(2);
    });

    test("keeps the current page and controls when Discord rejects the update", async () => {
        const activate = vi.fn();
        const session = {
            id: "session",
            page: 1,
            totalPages: 2,
            pageSize: 1,
            context: { page: 1 },
            spec: {
                items: ["first", "second"],
                render: items => ({ content: items.join(", ") }),
                controls: () => ({ rows: [], activate })
            }
        };
        const ctx = {
            isAuthor: true,
            interactionContext: {
                session,
                componentId: { prefix: "page", action: "next" },
                interaction: { isModalSubmit: () => false }
            },
            update: vi.fn().mockRejectedValue(new Error("Discord update failed"))
        };

        await expect(PaginationUtil.handleInteraction(ctx)).rejects.toThrow("Discord update failed");
        expect(activate).not.toHaveBeenCalled();
        expect(session.page).toBe(1);
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
            commandName: "list",
            parseArgs: parsedArgs,
            isAuthor: false,
            isInteraction: true,
            interactionContext: {
                session: mainSession,
                componentId: { prefix: "page", action: "next" },
                interaction: {
                    customId: "page:next:main_sess",
                    user: { id: "other_user" },
                    isRepliable: () => true,
                    isModalSubmit: () => false
                }
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

    test("adds kebab-case aliases, falls back to ctx.arg and standard option names", () => {
        const [pageArg, limitArg, allArg] = PaginationUtil.getPaginationArguments({
            pageName: "questPage",
            limitName: "pageSize",
            allName: "showAll"
        });

        expect(pageArg.aliases).toEqual(["p", "quest-page"]);
        expect(limitArg.aliases).toEqual(["l", "page-size"]);
        expect(allArg.aliases).toEqual(["a", "show-all"]);

        const legacyCtx = {
            commandName: "items",
            arg: name => ({ page: 3, limit: 20, all: true })[name]
        };

        expect(
            PaginationUtil.getPaginationOptions(legacyCtx, {
                pageName: "questPage",
                limitName: "pageSize",
                allName: "showAll"
            })
        ).toEqual({ page: 3, limit: 20, offset: 40, all: true });
    });

    test("supports array/total/count fetch results, clamps out-of-range fetch pages, and sets session.totalCount", async () => {
        const ctx = {
            author: { id: "author" },
            commandName: "items",
            parseArgs: () => parsedArgs({ page: 5 }),
            reply: vi.fn()
        };

        const fetch = vi.fn(async ({ page }) => ({
            items: page > 2 ? [] : Array.from({ length: 10 }, (_, i) => `p${page}-${i}`),
            total: 20
        }));

        await PaginationUtil.paginate(ctx, {
            limit: 10,
            fetch,
            render: (items, info) => ({ content: `${info.page}/${info.totalPages}:${items[0]}` })
        });

        expect(fetch).toHaveBeenCalledTimes(2);
        expect(ctx.page).toBe(2);
        expect(ctx.totalCount).toBe(20);
        expect(ctx.paginationSession.totalCount).toBe(20);
        expect(ctx.reply).toHaveBeenCalledWith(expect.objectContaining({ content: "2/2:p2-0" }), {});

        const bareCtx = {
            author: { id: "author" },
            commandName: "items",
            parseArgs: parsedArgs,
            reply: vi.fn()
        };

        await expect(
            PaginationUtil.paginate(bareCtx, {
                fetch: async () => ["only-a", "only-b"],
                render: (items, info) => `${info.totalCount}:${items.join(",")}`
            })
        ).resolves.toBe("2:only-a,only-b");
    });

    test("forwards targetPage to ephemeral ctx.arg/options and skips deferUpdate when non-repliable", async () => {
        const deferUpdate = vi.fn();
        const nonRepliableCtx = {
            isAuthor: true,
            interactionContext: {
                session: { id: "s1", page: 1, totalPages: 2, spec: {} },
                componentId: { prefix: "page", action: "prev" },
                interaction: {
                    isRepliable: () => false,
                    isModalSubmit: () => false,
                    replied: false,
                    deferred: false,
                    deferUpdate
                }
            }
        };

        await expect(PaginationUtil.handleInteraction(nonRepliableCtx)).resolves.toBe(true);
        expect(deferUpdate).not.toHaveBeenCalled();

        const seen = [];
        const mainSession = {
            id: "main_sess",
            authorId: "author_user",
            page: 1,
            totalPages: 3,
            pageSize: 2,
            totalCount: 6,
            spec: {
                items: ["a", "b", "c", "d", "e", "f"],
                render: (_items, _info, renderCtx) => {
                    seen.push({
                        pageArg: renderCtx.arg("page"),
                        pageOpt: renderCtx.options.page
                    });
                    return { content: "ok" };
                }
            },
            context: { page: 1 }
        };

        const ctx = {
            commandName: "list",
            arg: () => undefined,
            options: {},
            isAuthor: false,
            interactionContext: {
                session: mainSession,
                componentId: { prefix: "page", action: "next" },
                interaction: {
                    customId: "page:next:main_sess",
                    user: { id: "other_user" },
                    isRepliable: () => true,
                    isModalSubmit: () => false
                }
            },
            clone: overrides => ({ ...ctx, ...overrides }),
            reply: vi.fn()
        };

        await PaginationUtil.handleInteraction(ctx);
        expect(seen).toEqual([{ pageArg: 2, pageOpt: 2 }]);
    });
});
