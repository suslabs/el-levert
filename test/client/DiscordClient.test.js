import { describe, expect, test, vi } from "vitest";
import { ActivityType, ChannelType, DiscordAPIError, RESTJSONErrorCodes, Collection } from "discord.js";

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
        options: {
            makeCache: () => new Collection()
        },
        destroy: vi.fn(),
        login: vi.fn(),
        guilds: {
            fetch: vi.fn(),
            cache: new Map(),
            resolve: vi.fn().mockReturnValue(null)
        },
        channels: {
            fetch: vi.fn(),
            resolve: vi.fn().mockReturnValue(null)
        },
        users: {
            fetch: vi.fn(),
            resolve: vi.fn().mockReturnValue(null)
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
            isTextBased: () => true,
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

        await expect(client.fetchGuild("id", null)).resolves.toBeUndefined();
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
            isTextBased: () => true,
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
                        cache: new Map(),
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
                cache: new Map(),
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

    test("finds in current server first and falls back to other servers if not found", async () => {
        const client = createClient();

        const currentGuild = {
            id: "current-guild",
            members: {
                fetch: vi.fn().mockResolvedValue(new Map([["10", { id: "10", displayName: "LocalUser" }]]))
            }
        };

        const otherGuild = {
            id: "other-guild",
            members: {
                fetch: vi.fn().mockResolvedValue(new Map([["20", { id: "20", displayName: "RemoteUser" }]]))
            }
        };

        client.client.guilds.cache = new Map([
            ["current-guild", currentGuild],
            ["other-guild", otherGuild]
        ]);
        client.fetchGuild = vi.fn().mockImplementation(async id => {
            if (id === "current-guild") return currentGuild;
            if (id === "other-guild") return otherGuild;
            return null;
        });

        const resLocal = await client.findUsers("Local", { sv_id: "current-guild" });
        expect(resLocal).toEqual([{ id: "10", displayName: "LocalUser" }]);
        expect(otherGuild.members.fetch).not.toHaveBeenCalled();

        const resRemote = await client.findUsers("Remote", { sv_id: "current-guild" });
        expect(resRemote).toEqual([{ id: "20", displayName: "RemoteUser" }]);
        expect(otherGuild.members.fetch).toHaveBeenCalledWith({ query: "Remote", limit: 50 });
    });

    test("searches cached members first and processes other guilds in windows", async () => {
        const client = createClient();

        const currentGuild = {
            id: "guild-0",
            members: {
                cache: new Map([["111111111111111111", { id: "111111111111111111", displayName: "CachedCurrent" }]]),
                fetch: vi.fn()
            }
        };

        const otherGuild1 = {
            id: "guild-1",
            members: {
                cache: new Map([["222222222222222222", { id: "222222222222222222", displayName: "CachedRemote" }]]),
                fetch: vi.fn()
            }
        };

        const otherGuild2 = {
            id: "guild-2",
            members: {
                cache: new Map(),
                fetch: vi
                    .fn()
                    .mockResolvedValue(
                        new Map([["333333333333333333", { id: "333333333333333333", displayName: "FetchedBatch1" }]])
                    )
            }
        };

        const otherGuild3 = {
            id: "guild-3",
            members: {
                cache: new Map(),
                fetch: vi
                    .fn()
                    .mockResolvedValue(
                        new Map([["444444444444444444", { id: "444444444444444444", displayName: "FetchedBatch2" }]])
                    )
            }
        };

        client.client.guilds.cache = new Map([
            ["guild-0", currentGuild],
            ["guild-1", otherGuild1],
            ["guild-2", otherGuild2],
            ["guild-3", otherGuild3]
        ]);
        client.fetchGuild = vi.fn().mockImplementation(async id => client.client.guilds.cache.get(id) ?? null);

        const resCurrentCached = await client.findUsers("CachedCurrent", { sv_id: "guild-0" });
        expect(resCurrentCached).toEqual([{ id: "111111111111111111", displayName: "CachedCurrent" }]);
        expect(currentGuild.members.fetch).not.toHaveBeenCalled();

        const resOtherCached = await client.findUsers("CachedRemote", { sv_id: "guild-0" });
        expect(resOtherCached).toEqual([{ id: "222222222222222222", displayName: "CachedRemote" }]);
        expect(otherGuild1.members.fetch).not.toHaveBeenCalled();

        const resWindowed = await client.findUsers("FetchedBatch1", {
            sv_id: "guild-0",
            window: 2
        });
        expect(resWindowed).toEqual([{ id: "333333333333333333", displayName: "FetchedBatch1" }]);
        expect(otherGuild2.members.fetch).toHaveBeenCalled();
        expect(otherGuild3.members.fetch).not.toHaveBeenCalled();

        const resIdCached = await client.findUsers("111111111111111111", { sv_id: "guild-0" });
        expect(resIdCached).toEqual([{ id: "111111111111111111", displayName: "CachedCurrent" }]);

        const resRemoteIdCached = await client.findUsers("222222222222222222", { sv_id: "guild-0" });
        expect(resRemoteIdCached).toEqual([{ id: "222222222222222222", displayName: "CachedRemote" }]);
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
            isTextBased: () => true,
            messages: {
                fetch: vi.fn().mockRejectedValueOnce(new Error("message failed"))
            }
        });
        await expect(messageErrClient.fetchMessage("channel-id", "message-id")).rejects.toThrow("message failed");

        const messagesClient = createClient();
        messagesClient.fetchChannel = vi.fn().mockResolvedValueOnce(null);
        expect(await messagesClient.fetchMessages("channel-id", null)).toBeNull();

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

        client.client.users.fetch.mockRejectedValueOnce({
            code: RESTJSONErrorCodes.UnknownUser
        });
        expect(await client.findUserById("user-id", null)).toBeNull();

        client.client.users.fetch.mockRejectedValueOnce({
            code: RESTJSONErrorCodes.UnknownUser
        });
        expect(await client.findUserById("user-id")).toBeNull();

        client.client.users.fetch.mockRejectedValueOnce(new Error("lookup failed"));
        await expect(client.findUserById("user-id")).rejects.toThrow("lookup failed");

        client.client.guilds.cache = new Map([
            [
                "guild",
                {
                    members: {
                        cache: new Map(),
                        fetch: vi.fn().mockResolvedValue(new Map())
                    }
                }
            ]
        ]);
        expect(await client.findUsers("query", null)).toEqual([]);

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

    test("emulates guild, channel, member, and message without cache hits", async () => {
        const client = createClient();
        client.client.options = {
            makeCache: () => new Collection()
        };

        const usersSpy = vi.fn().mockImplementation(data => data);
        client.client.users._add = usersSpy;

        client.fetchGuild = vi.fn().mockResolvedValue(null);
        client.fetchChannel = vi.fn().mockResolvedValue(null);
        client.fetchMember = vi.fn().mockResolvedValue(null);

        const userObj = await client.emulateUser("11111");
        expect(userObj.id).toBe("11111");
        expect(userObj.username).toBe("dummy-user");

        client.findUserById = vi.fn().mockResolvedValue({ id: "22222", username: "real-user" });
        const existingUser = await client.emulateUser("22222");
        expect(existingUser.id).toBe("22222");
        expect(existingUser.username).toBe("real-user");
        client.findUserById = vi.fn().mockResolvedValue(null);

        const guild = await client.emulateGuild("12345");
        expect(guild.id).toBe("12345");
        expect(guild.name).toBe("dummy-guild");
        expect(guild.roles.everyone).toBeDefined();
        expect(guild.roles.everyone.id).toBe("12345");

        const channel = await client.emulateChannel("67890", guild);
        expect(channel.id).toBe("67890");
        expect(channel.name).toBe("dummy-channel");
        expect(channel.guild).toBe(guild);
        expect(guild.channels.cache.get("67890")).toBe(channel);

        const member = await client.emulateMember("54321", "12345", guild);
        expect(member.id).toBe("54321");
        expect(member.user.username).toBe("dummy-user");
        expect(member.guild).toBe(guild);
        expect(member.roles.highest).toBeDefined();
        expect(member.roles.highest.id).toBe("12345");
        expect(guild.members.cache.get("54321")).toBe(member);

        const realGuild = await client.emulateGuild("99999");
        client.client.guilds.cache.set("99999", realGuild);

        const realGuildChannel = await client.emulateChannel("88888", realGuild);
        const realGuildMember = await client.emulateMember("77777", "99999", realGuild);

        expect(realGuild.channels.cache.has("88888")).toBe(false);
        expect(realGuild.members.cache.has("77777")).toBe(false);

        expect(usersSpy).not.toHaveBeenCalled();

        const message = await client.emulateMessage("hello content", {
            guild: {
                id: "12345"
            },
            channel: {
                id: "67890"
            },
            author: {
                id: "54321",
                username: "dummy-user",
                globalName: "dummy-user",
                bot: false
            },
            member: {
                nick: "member-nick",
                roles: ["12345"]
            },
            message: {
                type: 1,
                attachments: [
                    {
                        id: "a1",
                        url: "https://example.com/a.txt",
                        contentType: "text/plain",
                        size: 3
                    }
                ],
                embeds: [
                    {
                        description: "embed body"
                    }
                ],
                reactions: [
                    {
                        emoji: {
                            name: "🔥"
                        }
                    }
                ],
                mentions: {
                    everyone: true
                }
            }
        });

        expect(message.type).toBe(1);
        expect(message.content).toBe("hello content");
        expect(message.channel.id).toBe("67890");
        expect(message.guild.id).toBe("12345");
        expect(message.member.id).toBe("54321");
        expect(message.member.nickname).toBe("member-nick");
        expect(message.author.id).toBe("54321");
        expect(message.attachments.first().url).toBe("https://example.com/a.txt");
        expect(message.attachments.first().contentType).toBe("text/plain");
        expect(message.embeds[0].data.description).toBe("embed body");
        expect(message.reactions).toEqual([
            {
                emoji: {
                    name: "🔥"
                }
            }
        ]);
        expect(message.mentions.everyone).toBe(true);
    });

    test("emulates message with the resolved guild id and owner fallback", async () => {
        const client = createClient();
        client.owner = "owner-id";
        client.client.users._add = vi.fn().mockImplementation(data => data);

        const guild = {
                id: "real-guild"
            },
            channel = {
                id: "real-channel"
            },
            member = {
                user: {
                    id: "owner-id",
                    username: "owner-user",
                    discriminator: "1234",
                    avatar: null,
                    bot: false,
                    system: false,
                    globalName: "owner-user"
                }
            };

        client.emulateGuild = vi.fn().mockResolvedValue(guild);
        client.emulateChannel = vi.fn().mockResolvedValue(channel);
        client.emulateMember = vi.fn().mockResolvedValue(member);

        const message = await client.emulateMessage("hello content", {
            guild: {
                id: "input-guild"
            },
            channel: {
                id: "input-channel"
            },
            member: {
                nick: "owner-nick"
            },
            author: {
                username: "owner-user"
            }
        });

        expect(client.emulateGuild).toHaveBeenCalledWith("input-guild", {
            id: "input-guild"
        });
        expect(client.emulateChannel).toHaveBeenCalledWith("input-channel", guild, {
            id: "input-channel"
        });
        expect(client.emulateMember).toHaveBeenCalledWith("owner-id", "real-guild", guild, {
            user: {
                username: "owner-user"
            },
            nick: "owner-nick"
        });
        expect(message.author).toBe(message.member.user);
        expect(message.author.id).toBe("owner-id");
        expect(message.channel.id).toBe("real-channel");
        expect(message.guild.id).toBe("real-guild");
    });

    test("emulates entity overrides from option objects", async () => {
        const client = createClient();
        client.client.users._add = vi.fn().mockImplementation(data => data);
        client.findUserById = vi.fn().mockResolvedValue(null);
        client.fetchGuild = vi.fn().mockResolvedValue(null);
        client.fetchChannel = vi.fn().mockResolvedValue(null);
        client.fetchMember = vi.fn().mockResolvedValue(null);

        const user = await client.emulateUser("11111", {
            username: "custom-user",
            globalName: "custom-global",
            bot: true
        });
        expect(user.id).toBe("11111");
        expect(user.username).toBe("custom-user");
        expect(user.globalName).toBe("custom-global");
        expect(user.bot).toBe(true);
        expect(client.findUserById).not.toHaveBeenCalled();

        const guild = await client.emulateGuild("22222", {
            name: "custom-guild"
        });
        expect(guild.id).toBe("22222");
        expect(guild.name).toBe("custom-guild");

        const channel = await client.emulateChannel("33333", guild, {
            type: ChannelType.GuildVoice,
            name: "custom-channel",
            lastMessageId: "last-message-id"
        });
        expect(channel.id).toBe("33333");
        expect(channel.name).toBe("custom-channel");
        expect(channel.type).toBe(ChannelType.GuildVoice);
        expect(channel.lastMessageId).toBe("last-message-id");
        expect(channel.guild).toBe(guild);

        const member = await client.emulateMember("44444", guild.id, guild, {
            nick: "member-nick",
            roles: ["role-1"],
            user: {
                username: "member-user",
                globalName: "member-global",
                bot: false
            }
        });
        expect(member.id).toBe("44444");
        expect(member.nickname).toBe("member-nick");
        expect(member.roles.cache.has("role-1")).toBe(true);
        expect(member.user.username).toBe("member-user");
        expect(member.user.globalName).toBe("member-global");
    });
});
