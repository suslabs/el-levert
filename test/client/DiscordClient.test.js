import { describe, expect, test, vi } from "vitest";
import { ActivityType, ChannelType, DiscordAPIError, RESTJSONErrorCodes } from "discord.js";

import DiscordClient from "../../src/client/DiscordClient.js";

function createClient() {
    const client = Object.create(DiscordClient.prototype);

    client.constructor = DiscordClient;
    client.timeout = 150;
    client.mentionUsers = false;
    client.pingReply = true;
    client.loggedIn = false;
    client.logger = {
        info: vi.fn(),
        error: vi.fn(),
        log: vi.fn()
    };
    client.client = {
        options: {},
        destroy: vi.fn(),
        login: vi.fn(),
        guilds: {
            fetch: vi.fn(),
            cache: new Map()
        },
        channels: {
            fetch: vi.fn()
        },
        users: {
            fetch: vi.fn()
        },
        user: {
            id: "bot-id",
            username: "bot",
            setActivity: vi.fn()
        }
    };

    return client;
}

describe("DiscordClient", () => {
    test("copies known options, updates mention config, and validates parsed ids", () => {
        const client = createClient();

        client.setOptions({
            mentionUsers: true,
            pingReply: false,
            wrapEvents() {
                return this;
            },
            ignored: true
        });

        expect(client.mentionUsers).toBe(true);
        expect(client.pingReply).toBe(false);
        expect(client.options).not.toHaveProperty("ignored");
        expect(client.client.options.allowedMentions).toEqual({
            repliedUser: false,
            parse: ["users", "roles"]
        });

        class Thing {}

        const thing = new Thing();
        thing.id = "123";

        expect(client._parseDiscordId(thing, "thing", Thing)).toEqual(["123", thing]);
        expect(
            client._parseDiscordId(
                {
                    id: "456"
                },
                "thing",
                Thing
            )
        ).toEqual(["456", null]);
        expect(client._parseDiscordId(null, "thing", Thing, false)).toEqual([null, null]);
        expect(() => client._parseDiscordId("", "thing", Thing, true)).toThrow("length = 0");
        expect(() => client._parseDiscordId(1, "thing", Thing, true)).toThrow("Invalid thing ID provided");
    });

    test("logs in successfully, handles failed logins, logs out, and updates ready state", async () => {
        const client = createClient();
        client.killProcess = vi.fn();
        client.onLogout = vi.fn();

        client.client.login.mockImplementationOnce(async () => {
            setTimeout(() => {
                client.loggedIn = true;
            }, 0);
        });

        await expect(client.login("token")).resolves.toBe(true);

        const loginErr = new Error("bad token");
        client.client.login.mockRejectedValueOnce(loginErr);

        await expect(client.login("token")).rejects.toThrow("bad token");
        expect(client.logger.error).toHaveBeenCalledWith("Error occurred while logging in:", loginErr);

        client.client.login.mockRejectedValueOnce(loginErr);
        await expect(client.login("token", true)).resolves.toBe(false);
        expect(client.killProcess).toHaveBeenCalledTimes(1);

        client.logout(true);
        expect(client.onLogout).toHaveBeenCalledTimes(1);
        expect(client.client).toBeNull();
        expect(client.loggedIn).toBe(false);
        expect(client.killProcess).toHaveBeenCalledTimes(2);

        const readyClient = createClient();
        readyClient.onReady();
        expect(readyClient.loggedIn).toBe(true);
        expect(readyClient.botId).toBe("bot-id");
        expect(readyClient.botUsername).toBe("bot");
    });

    test("validates and applies activity updates", () => {
        const client = createClient();
        client.client.user.setActivity.mockReturnValue({
            activities: [
                {
                    type: ActivityType.Playing,
                    name: "with tests"
                }
            ]
        });

        expect(() =>
            client.setActivity({
                type: "invalid",
                text: "ignored"
            })
        ).toThrow("Invalid activity type");

        expect(() => client.setActivity(null)).toThrow("Invalid activity config");

        expect(() =>
            client.setActivity({
                type: "playing",
                text: null
            })
        ).toThrow("Invalid activity text");

        expect(() =>
            client.setActivity({
                type: "playing",
                text: "   "
            })
        ).toThrow("Invalid activity text");

        expect(
            client.setActivity({
                type: "playing",
                text: "with tests"
            })
        ).toEqual({
            type: ActivityType.Playing,
            name: "with tests"
        });
    });

    test("fetches guilds, members, users, and messages through success and unknown-id branches", async () => {
        const client = createClient();

        client._parseDiscordId = vi
            .fn()
            .mockReturnValueOnce([
                "guild-id",
                {
                    id: "guild-id"
                }
            ])
            .mockReturnValueOnce(["guild-id", null])
            .mockReturnValueOnce(["member-id", null])
            .mockReturnValueOnce([
                "message-id",
                {
                    id: "message-id"
                }
            ])
            .mockReturnValueOnce(["user-id", null])
            .mockReturnValueOnce([
                "user-id",
                {
                    id: "user-id"
                }
            ]);

        expect(await client.fetchGuild("guild-id")).toEqual({
            id: "guild-id"
        });

        client.client.guilds.fetch.mockResolvedValueOnce({
            id: "guild-id"
        });
        expect(await client.fetchGuild("guild-id")).toEqual({
            id: "guild-id"
        });

        const guild = {
            members: {
                fetch: vi.fn().mockResolvedValue({
                    id: "member-id"
                })
            }
        };
        client.fetchGuild = vi.fn().mockResolvedValue(guild);
        expect(await client.fetchMember("guild-id", "member-id")).toEqual({
            id: "member-id"
        });

        const channel = {
            messages: {
                fetch: vi.fn()
            }
        };
        client.fetchChannel = vi.fn().mockResolvedValue(channel);
        expect(await client.fetchMessage("channel-id", "message-id")).toEqual({
            id: "message-id"
        });

        client.client.users.fetch.mockResolvedValueOnce({
            id: "user-id",
            username: "alex"
        });
        expect(await client.findUserById("user-id")).toMatchObject({
            id: "user-id",
            user: {
                id: "user-id"
            }
        });

        expect(
            await client.findUserById({
                id: "user-id"
            })
        ).toMatchObject({
            id: "user-id",
            user: {
                id: "user-id"
            }
        });
    });

    test("handles missing ids and access checks while fetching channels and message collections", async () => {
        const client = createClient();

        await expect(client.fetchGuild("id", null)).rejects.toThrow("Invalid options provided");
        await expect(client.findUsers("   ")).rejects.toThrow("No query provided");

        client._parseDiscordId = vi
            .fn()
            .mockReturnValueOnce([
                "channel-id",
                {
                    type: ChannelType.DM,
                    recipientId: "user-1"
                }
            ])
            .mockReturnValueOnce([
                "channel-id",
                {
                    type: ChannelType.DM,
                    recipientId: "user-2"
                }
            ])
            .mockReturnValueOnce([
                "channel-id",
                {
                    type: ChannelType.GuildText,
                    guild: "guild-1",
                    memberPermissions: () => ({
                        has: () => false
                    })
                }
            ])
            .mockReturnValueOnce(["message-id", null])
            .mockReturnValueOnce(["before-id", null])
            .mockReturnValueOnce(["after-id", null])
            .mockReturnValueOnce(["around-id", null]);

        expect(
            await client.fetchChannel("channel-id", {
                checkAccess: true,
                user_id: "user-1"
            })
        ).toMatchObject({
            recipientId: "user-1"
        });

        expect(
            await client.fetchChannel("channel-id", {
                checkAccess: true,
                user_id: "user-1"
            })
        ).toBeNull();

        client.fetchMember = vi.fn().mockResolvedValue({
            guild: "guild-1"
        });
        expect(
            await client.fetchChannel("channel-id", {
                checkAccess: true,
                user_id: "user-1"
            })
        ).toBeNull();

        client.fetchChannel = vi.fn().mockResolvedValue({
            messages: {
                fetch: vi.fn().mockRejectedValueOnce({
                    code: RESTJSONErrorCodes.UnknownMessage
                })
            }
        });
        expect(await client.fetchMessage("channel-id", "message-id")).toBeNull();

        client.fetchChannel = vi.fn().mockResolvedValue({
            messages: {
                fetch: vi.fn().mockResolvedValueOnce(["one", "two"])
            }
        });
        expect(
            await client.fetchMessages(
                "channel-id",
                {},
                {
                    before: "before-id",
                    after: "after-id",
                    around: "around-id"
                }
            )
        ).toEqual(["one", "two"]);
    });

    test("covers additional findUsers branches for null queries, only-members, and member searches", async () => {
        const client = createClient();
        client.client.guilds.cache = new Map([
            [
                "guild",
                {
                    members: {
                        fetch: vi.fn().mockResolvedValue(
                            new Map([
                                [
                                    "1",
                                    {
                                        id: "1",
                                        displayName: "Alpha"
                                    }
                                ],
                                [
                                    "2",
                                    {
                                        id: "2",
                                        displayName: "Alpha"
                                    }
                                ]
                            ])
                        )
                    }
                }
            ]
        ]);

        await expect(client.findUsers(null)).rejects.toThrow("No query provided");

        client.fetchGuild = vi.fn().mockResolvedValue({
            members: {
                fetch: vi.fn().mockResolvedValue(new Map())
            }
        });
        client.fetchMember = vi.fn().mockResolvedValue(null);
        expect(
            await client.findUsers("123456789012345678", {
                sv_id: "guild",
                onlyMembers: true
            })
        ).toEqual([]);

        expect(
            await client.findUsers("Alpha", {
                searchMembers: false
            })
        ).toEqual([]);

        const result = await client.findUsers(
            "Alpha",
            {
                limit: 1
            },
            {
                limit: 7
            }
        );

        expect(result).toEqual([
            {
                id: "1",
                displayName: "Alpha"
            }
        ]);
    });

    test("covers fetchMember, fetchChannel, fetchMessage, and fetchMessages error branches", async () => {
        const client = createClient();

        client.fetchGuild = vi.fn().mockResolvedValueOnce(null);
        expect(await client.fetchMember("guild-id", "user-id")).toBeNull();

        client.fetchGuild = vi.fn().mockResolvedValueOnce({
            members: {
                fetch: vi.fn().mockRejectedValueOnce({
                    code: RESTJSONErrorCodes.UnknownMember
                })
            }
        });
        expect(await client.fetchMember("guild-id", "user-id")).toBeNull();

        const memberErr = new Error("member failed");
        client.fetchGuild = vi.fn().mockResolvedValueOnce({
            members: {
                fetch: vi.fn().mockRejectedValueOnce(memberErr)
            }
        });
        await expect(client.fetchMember("guild-id", "user-id")).rejects.toThrow("member failed");

        const missingChannelClient = createClient();
        missingChannelClient._parseDiscordId = vi.fn().mockReturnValueOnce(["channel-id", null]);
        missingChannelClient.client.channels.fetch.mockRejectedValueOnce({
            code: RESTJSONErrorCodes.UnknownChannel
        });
        expect(await missingChannelClient.fetchChannel("channel-id")).toBeNull();

        const missingAccessClient = createClient();
        missingAccessClient._parseDiscordId = vi.fn().mockReturnValueOnce(["channel-id", null]);
        missingAccessClient.client.channels.fetch.mockRejectedValueOnce({
            code: RESTJSONErrorCodes.MissingAccess
        });
        expect(await missingAccessClient.fetchChannel("channel-id")).toBeNull();

        const channelErrClient = createClient();
        channelErrClient._parseDiscordId = vi.fn().mockReturnValueOnce(["channel-id", null]);
        channelErrClient.client.channels.fetch.mockRejectedValueOnce(new Error("channel failed"));
        await expect(channelErrClient.fetchChannel("channel-id")).rejects.toThrow("channel failed");

        const dmClient = createClient();
        dmClient._parseDiscordId = vi.fn().mockReturnValue([
            "channel-id",
            {
                type: ChannelType.DM,
                recipientId: "user-1"
            }
        ]);
        await expect(
            dmClient.fetchChannel("channel-id", {
                checkAccess: true
            })
        ).rejects.toThrow("No user ID provided");
        await expect(
            dmClient.fetchChannel("channel-id", {
                checkAccess: true,
                user_id: ""
            })
        ).rejects.toThrow("length = 0");
        await expect(
            dmClient.fetchChannel("channel-id", {
                checkAccess: true,
                user_id: 1
            })
        ).rejects.toThrow("Invalid user ID provided");

        const guildClient = createClient();
        guildClient._parseDiscordId = vi.fn().mockReturnValue([
            "channel-id",
            {
                type: ChannelType.GuildText,
                guild: "guild-1",
                memberPermissions: () => ({
                    has: () => true
                })
            }
        ]);
        guildClient.fetchMember = vi.fn().mockResolvedValueOnce(null);
        expect(
            await guildClient.fetchChannel("channel-id", {
                checkAccess: true,
                user_id: "user-1"
            })
        ).toBeNull();

        guildClient.fetchMember = vi.fn().mockResolvedValueOnce({
            guild: "guild-2"
        });
        await expect(
            guildClient.fetchChannel("channel-id", {
                checkAccess: true,
                user_id: "user-1"
            })
        ).rejects.toThrow("isn't the same as the channel's guild");

        const threadClient = createClient();
        threadClient._parseDiscordId = vi.fn().mockReturnValue([
            "channel-id",
            {
                type: ChannelType.PublicThread,
                guild: "guild-1",
                parent: {
                    memberPermissions: () => null
                }
            }
        ]);
        threadClient.fetchMember = vi.fn().mockResolvedValueOnce({
            guild: "guild-1"
        });
        expect(
            await threadClient.fetchChannel("channel-id", {
                checkAccess: true,
                user_id: "user-1"
            })
        ).toBeNull();

        const threadOkClient = createClient();
        const threadChannel = {
            type: ChannelType.PrivateThread,
            guild: "guild-1",
            parent: {
                memberPermissions: () => ({
                    has: () => true
                })
            }
        };
        threadOkClient._parseDiscordId = vi.fn().mockReturnValue(["channel-id", threadChannel]);
        threadOkClient.fetchMember = vi.fn().mockResolvedValueOnce({
            guild: "guild-1"
        });
        expect(
            await threadOkClient.fetchChannel("channel-id", {
                checkAccess: true,
                user_id: "user-1"
            })
        ).toBe(threadChannel);

        const messageErrClient = createClient();
        messageErrClient.fetchChannel = vi.fn().mockResolvedValueOnce({
            messages: {
                fetch: vi.fn().mockRejectedValueOnce(new Error("message failed"))
            }
        });
        await expect(messageErrClient.fetchMessage("channel-id", "message-id")).rejects.toThrow("message failed");

        const messagesClient = createClient();
        await expect(messagesClient.fetchMessages("channel-id", null)).rejects.toThrow("Invalid options provided");

        messagesClient.fetchChannel = vi.fn().mockResolvedValueOnce(null);
        expect(await messagesClient.fetchMessages("channel-id")).toBeNull();

        const apiErr = Object.create(DiscordAPIError.prototype);

        messagesClient.fetchChannel = vi.fn().mockResolvedValueOnce({
            messages: {
                fetch: vi.fn().mockRejectedValueOnce(apiErr)
            }
        });
        expect(await messagesClient.fetchMessages("channel-id")).toBeNull();

        messagesClient.fetchChannel = vi.fn().mockResolvedValueOnce({
            messages: {
                fetch: vi.fn().mockRejectedValueOnce(new Error("history failed"))
            }
        });
        await expect(messagesClient.fetchMessages("channel-id")).rejects.toThrow("history failed");
    });

    test("covers findUserById and findUsers fallback, validation, and process shutdown branches", async () => {
        const client = createClient();

        await expect(client.findUserById("user-id", null)).rejects.toThrow("Invalid options provided");

        client.client.users.fetch.mockRejectedValueOnce({
            code: RESTJSONErrorCodes.UnknownUser
        });
        expect(await client.findUserById("user-id")).toBeNull();

        client.client.users.fetch.mockRejectedValueOnce(new Error("lookup failed"));
        await expect(client.findUserById("user-id")).rejects.toThrow("lookup failed");

        await expect(client.findUsers("query", null)).rejects.toThrow("Invalid options provided");

        client.client.guilds.cache = new Map([
            [
                "guild",
                {
                    members: {
                        fetch: vi.fn().mockResolvedValue(new Map())
                    }
                }
            ]
        ]);

        client.fetchMember = vi.fn().mockResolvedValueOnce({
            id: "123456789012345678",
            guild: "guild-1",
            displayName: "Alpha"
        });
        expect(await client.findUsers("<@123456789012345678>")).toEqual([
            {
                id: "123456789012345678",
                guild: "guild-1",
                displayName: "Alpha"
            }
        ]);

        client.fetchMember = vi.fn().mockResolvedValueOnce(null);
        client.findUserById = vi.fn().mockResolvedValueOnce(null);
        expect(await client.findUsers("123456789012345678")).toEqual([]);

        const exitClient = createClient();
        exitClient.onKill = vi.fn();

        const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined);

        exitClient.killProcess();

        expect(exitClient.onKill).toHaveBeenCalledTimes(1);
        expect(exitSpy).toHaveBeenCalledWith(0);

        exitSpy.mockRestore();
    });

    test("guards event loading state transitions", async () => {
        const client = createClient();

        await expect(client._loadEvents()).rejects.toThrow("Events directory not set");
        expect(() => client._unloadEvents()).toThrow("events were never loaded");

        client._eventLoader = {
            loaded: true,
            removeListeners: vi.fn()
        };

        client._unloadEvents();

        expect(client._eventLoader).toBeUndefined();
    });
});
