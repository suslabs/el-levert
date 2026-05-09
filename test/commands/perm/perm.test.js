import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { addAdmin, cleanupRuntime, createCommandMessage, createCommandRuntime, getCommand, executeCommand } from "../../helpers/commandHarness.js";
import PermissionError from "../../../src/errors/PermissionError.js";

let runtime;
let adminMsg;

beforeEach(async () => {
    runtime = await createCommandRuntime({
        loadVMs: false
    });
    await addAdmin(runtime);

    adminMsg = createCommandMessage("%perm", {
        author: {
            id: "admin-user",
            username: "admin"
        }
    });
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("perm command", () => {
    test("shows the real permission subcommand help", async () => {
        const command = getCommand(runtime, "perm");
        const out = await executeCommand(command, "", { msg: adminMsg });

        expect(out).toContain("add_group");
        expect(out).toContain("remove_all");
    });
});

describe("Merged Branch Coverage", () => {
    let runtime;
    let command;
    let adminMsg;
    let ownerMsg;
    let userMsg;

    async function run(args, msg = adminMsg) {
        return await executeCommand(command, args, {
            msg
        });
    }

    beforeEach(async () => {
        runtime = await createCommandRuntime({
            loadVMs: false
        });

        command = getCommand(runtime, "perm");

        await addAdmin(runtime);

        adminMsg = createCommandMessage("%perm", {
            author: {
                id: "admin-user",
                username: "admin"
            }
        });

        ownerMsg = createCommandMessage("%perm", {
            author: {
                id: "owner-id",
                username: "owner"
            }
        });

        userMsg = createCommandMessage("%perm", {
            author: {
                id: "user-1",
                username: "alex"
            }
        });
    }, 30000);

    afterEach(async () => {
        vi.restoreAllMocks();
        await cleanupRuntime(runtime);
    }, 30000);

    describe("perm command branches", () => {
        test("covers add_group validation, permission, success, and manager failures", async () => {
            expect(await run("add_group")).toContain("group_name level");
            expect(await run("add_group bad* 4")).toContain("must consist");
            expect(await run("add_group mods nope")).toContain("Invalid group level");
            expect(await run("add_group bosses 9")).toContain("higher than your own");

            expect(await run("add_group mods 5")).toContain("Added group");
            expect(await run("add_group mods 5")).toContain("already exists");

            vi.spyOn(runtime.client.permManager, "addGroup").mockRejectedValueOnce(new PermissionError("Manager failed"));
            expect(await run("add_group helpers 4")).toContain("Manager failed");
        });

        test("covers add validation, missing data, membership checks, and error handling", async () => {
            await runtime.client.permManager.addGroup("mods", 5, true);
            await runtime.client.permManager.addGroup("bosses", 9, true);

            expect(await run("add")).toContain("group_name");
            expect(await run("add bad* alice")).toContain("must consist");
            expect(await run("add missing alice")).toContain("doesn't exist");
            expect(await run("add bosses alice")).toContain("higher level your own");

            runtime.client.findUsers = async () => [];
            expect(await run("add mods ghost")).toContain("User `ghost` not found");

            runtime.client.findUsers = async () => [
                {
                    id: "alice-id",
                    user: {
                        id: "alice-id",
                        username: "alice"
                    }
                }
            ];

            expect(await run("add mods alice")).toContain("Added user `alice`");
            expect(await run("add mods alice")).toContain("already a part");

            runtime.client.findUsers = async () => [
                {
                    id: "carol-id",
                    user: {
                        id: "carol-id",
                        username: "carol"
                    }
                }
            ];

            vi.spyOn(runtime.client.permManager, "add").mockRejectedValueOnce(new PermissionError("Insert failed"));
            expect(await run("add mods carol")).toContain("Insert failed");
        });

        test("covers check and list output for self, other users, and empty results", async () => {
            const mods = await runtime.client.permManager.addGroup("mods", 5, true);
            const helpers = await runtime.client.permManager.addGroup("helpers", 4, true);
            await runtime.client.permManager.add(mods, "alice-id", true);
            await runtime.client.permManager.add(helpers, "alice-id", true);

            expect(await run("check", userMsg)).toContain("You have **no** permissions");

            const selfCheck = await run("check", adminMsg);
            expect(selfCheck.content).toContain("You have the following permissions");

            const otherCheck = await run("check alice");
            expect(otherCheck.content).toContain("User `alice` has the following permissions");
            expect(otherCheck.embeds[0].data.description).toContain("1.");
            expect(otherCheck.embeds[0].data.description).toContain("2.");

            const unknownCheck = await run("check ghost");
            expect(unknownCheck).toContain("User `ghost` has **no** permissions");

            const listed = await run("list");
            expect(listed.content).toContain("Registered permissions");
            expect(listed.embeds).toHaveLength(1);

            vi.spyOn(runtime.client.permManager, "listGroups").mockResolvedValueOnce(null);
            expect(await run("list")).toContain("**No** permissions are registered");
        });

        test("covers remove validation, permissions, missing membership, success, and manager failures", async () => {
            const mods = await runtime.client.permManager.addGroup("mods", 5, true);
            const bosses = await runtime.client.permManager.addGroup("bosses", 9, true);

            await runtime.client.permManager.add(mods, "alice-id", true);
            await runtime.client.permManager.add(bosses, "boss-id", true);

            expect(await run("remove")).toContain("group_name");
            expect(await run("remove bad* alice")).toContain("must consist");

            runtime.client.findUsers = async () => [];
            expect(await run("remove mods ghost")).toContain("User `ghost` not found");

            runtime.client.findUsers = async query => [
                {
                    id: `${query}-id`,
                    user: {
                        id: `${query}-id`,
                        username: query
                    }
                }
            ];

            expect(await run("remove missing alice")).toContain("doesn't exist");
            expect(await run("remove bosses boss")).toContain("higher level than your own");
            expect(await run("remove mods nobody")).toContain("is not in group");
            expect(await run("remove mods alice")).toContain("Removed user `alice`");

            vi.spyOn(runtime.client.permManager, "remove").mockRejectedValueOnce(new PermissionError("Removal failed"));
            expect(await run("remove mods alice")).toContain("Removal failed");
        });

        test("covers remove_all branches for missing users, owner fallback, permission checks, and empty removals", async () => {
            const mods = await runtime.client.permManager.addGroup("mods", 5, true);
            const bosses = await runtime.client.permManager.addGroup("bosses", 9, true);

            await runtime.client.permManager.add(mods, "alice-id", true);
            await runtime.client.permManager.add(bosses, "boss-id", true);

            expect(await run("remove_all")).toContain("(ping/id/username)");

            runtime.client.findUsers = async () => [];
            expect(await run("remove_all ghost")).toContain("User `ghost` not found");

            vi.spyOn(runtime.client.permManager, "removeAll").mockResolvedValueOnce(true);
            expect(await run("remove_all ghost", ownerMsg)).toContain("Tried removing by verbatim input");

            vi.spyOn(runtime.client.permManager, "removeAll").mockResolvedValueOnce(false);
            expect(await run("remove_all ghost", ownerMsg)).toContain("doesn't have any permissions");

            runtime.client.findUsers = async query => [
                {
                    id: `${query}-id`,
                    user: {
                        id: `${query}-id`,
                        username: query
                    }
                }
            ];

            expect(await run("remove_all boss")).toContain("higher than your own");
            expect(await run("remove_all alice")).toContain("Removed `alice`");
            expect(await run("remove_all alice")).toContain("doesn't have any permissions");
            expect(await run("remove_all owner", ownerMsg)).toContain("other than being the bot owner");
        });

        test("covers remove_group validation, permission checks, success, and manager failures", async () => {
            await runtime.client.permManager.addGroup("mods", 5, true);
            await runtime.client.permManager.addGroup("bosses", 9, true);

            expect(await run("remove_group")).toContain("group_name");
            expect(await run("remove_group bad*")).toContain("must consist");
            expect(await run("remove_group missing")).toContain("doesn't exist");
            expect(await run("remove_group bosses")).toContain("higher than yours");
            expect(await run("remove_group mods")).toContain("Removed group");

            await runtime.client.permManager.addGroup("helpers", 4, true);
            vi.spyOn(runtime.client.permManager, "removeGroup").mockRejectedValueOnce(new PermissionError("Delete failed"));
            expect(await run("remove_group helpers")).toContain("Delete failed");
        });

        test("covers update_group validation, unchanged markers, conflicts, permission checks, and success", async () => {
            await runtime.client.permManager.addGroup("mods", 5, true);
            await runtime.client.permManager.addGroup("helpers", 4, true);

            expect(await run("update_group")).toContain("group_name");
            expect(await run("update_group bad* helpers 4")).toContain("must consist");
            expect(await run("update_group missing helpers 4")).toContain("doesn't exist");
            expect(await run("update_group mods bad* 4")).toContain("must consist");
            expect(await run("update_group mods unchanged nope")).toContain("Invalid group level");
            expect(await run("update_group mods unchanged unchanged")).toContain("No group changes provided");
            expect(await run("update_group mods unchanged 9")).toContain("higher than your own");
            expect(await run("update_group mods unchanged 5")).toContain("same level");
            expect(await run("update_group mods helpers 6")).toContain("already exists");
            expect(await run("update_group mods unchanged 6")).toContain("Updated group");

            await runtime.client.permManager.addGroup("writers", 3, true);
            vi.spyOn(runtime.client.permManager, "updateGroup").mockRejectedValueOnce(new PermissionError("Update failed"));
            expect(await run("update_group writers scribes 4")).toContain("Update failed");
        });
    });
});
