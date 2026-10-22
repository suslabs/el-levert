import { describe, expect, test } from "vitest";

import "../../../../setupGlobals.js";

import FakeMsg from "../../../../src/vm/isolated-vm/classes/FakeMsg.js";
import FakeTag from "../../../../src/vm/isolated-vm/classes/FakeTag.js";
import FakeUser from "../../../../src/vm/isolated-vm/classes/FakeUser.js";

describe("isolated-vm fake classes", () => {
    test("covers FakeUser and FakeTag edge cases", () => {
        expect(new FakeUser().fixedUser).toEqual({});
        expect(new FakeTag(undefined, "   ").fixedTag).toEqual({});

        const member = {
            guild: {
                id: "guild-1"
            },
            joinedTimestamp: 10,
            premiumSinceTimestamp: 20,
            nickname: "nick",
            pending: false,
            communicationDisabledUntilTimestamp: 30,
            displayName: "Display",
            _roles: ["role-1"],
            user: {
                id: "user-1",
                bot: false,
                system: false,
                flags: {
                    bitfield: 2
                },
                username: "tester",
                discriminator: "0001",
                avatar: "avatar",
                banner: "banner",
                accentColor: 123,
                createdTimestamp: 40,
                defaultAvatarURL: "default",
                hexAccentColor: "#fff",
                tag: "tester#0001",
                globalName: "Tester",
                avatarURL: () => "avatar-url",
                displayAvatarURL: () => "display-avatar-url",
                bannerURL: () => "banner-url"
            }
        };

        expect(new FakeUser(member).fixedUser).toMatchObject({
            id: "user-1",
            guildId: "guild-1",
            displayName: "Display",
            roles: ["role-1"]
        });

        expect(new FakeTag({ name: "alpha", body: "body", owner: "owner" }, "  args  ").fixedTag).toEqual({
            args: "args",
            body: "body",
            name: "alpha",
            owner: "owner"
        });
    });

    test("covers FakeMsg construction and reply formatting", () => {
        expect(new FakeMsg().fixedMsg).toEqual({});

        const user = {
            id: "user-1",
            bot: false,
            system: false,
            flags: {
                bitfield: 1
            },
            username: "tester",
            discriminator: "0001",
            avatar: "avatar",
            banner: "banner",
            accentColor: 1,
            createdTimestamp: 200,
            defaultAvatarURL: "default-avatar",
            hexAccentColor: "#111111",
            tag: "tester#0001",
            globalName: "Tester",
            avatarURL: () => "avatar-url",
            displayAvatarURL: () => "display-avatar-url",
            bannerURL: () => "banner-url"
        };

        const member = {
            guild: {
                id: "guild-1"
            },
            joinedTimestamp: 10,
            premiumSinceTimestamp: 20,
            nickname: "nick",
            pending: false,
            communicationDisabledUntilTimestamp: 30,
            displayName: "Display",
            _roles: ["role-1"],
            user
        };

        const msg = {
            channelId: "channel-1",
            guildId: "guild-1",
            id: "message-1",
            createdTimestamp: 100,
            type: 0,
            system: false,
            content: "hello",
            author: user,
            member,
            pinned: false,
            tts: false,
            nonce: "nonce",
            embeds: [
                {
                    data: {
                        description: "embed-body"
                    }
                }
            ],
            components: [],
            attachments: new Map([["a", { url: "https://example.com/a" }]]),
            stickers: new Map([["s", { id: "sticker-1" }]]),
            position: 5,
            roleSubscriptionData: null,
            editedTimestamp: 300,
            mentions: {
                everyone: false,
                users: new Map([["u2", { id: "u2" }]]),
                roles: new Map([["r1", { id: "r1" }]]),
                crosspostedChannels: new Map([["c2", { id: "c2" }]]),
                repliedUser: {
                    id: "u3"
                },
                members: new Map([["m1", { id: "m1" }]]),
                channels: new Map([["c3", { id: "c3" }]])
            },
            webhookId: null,
            groupActivityApplicationId: null,
            applicationId: null,
            activity: null,
            flags: {
                bitfield: 9
            },
            reference: {
                messageId: "ref-1"
            },
            interaction: null,
            channel: {
                type: 0,
                flags: {
                    bitfield: 3
                },
                id: "channel-1",
                recipientId: "recipient-1",
                lastPinTimestamp: 400,
                name: "general",
                parentId: "parent-1",
                topic: "topic",
                messages: {
                    cache: {
                        last: () => [{ id: "message-1" }, { id: "message-0" }]
                    }
                },
                lastMessageId: "message-1",
                createdTimestamp: 500,
                rateLimitPerUser: 2,
                guild: {
                    id: "guild-1",
                    name: "Guild",
                    icon: "icon",
                    banner: "banner",
                    description: "description",
                    memberCount: 3,
                    premiumTier: 1,
                    createdTimestamp: 600,
                    ownerId: "owner-1"
                }
            }
        };

        const fakeMsg = new FakeMsg(msg);

        expect(fakeMsg.fixedMsg).toMatchObject({
            id: "message-1",
            content: "hello",
            author: {
                id: "user-1",
                guildId: "guild-1",
                displayName: "Display",
                nickname: "nick",
                roles: ["role-1"]
            },
            channel: {
                id: "channel-1",
                messages: ["message-0"]
            },
            mentions: {
                repliedUser: "u3"
            },
            guild: {
                id: "guild-1"
            }
        });
        expect(fakeMsg.fixedMsg.author.guildId).toBe(fakeMsg.fixedMsg.guildId);

        const dmMsg = {
            ...msg,
            member: null,
            guildId: null,
            guild: null
        };
        const fakeDMMsg = new FakeMsg(dmMsg);

        expect(fakeDMMsg.fixedMsg.author).toMatchObject({
            id: "user-1",
            username: "tester"
        });
        expect(fakeDMMsg.fixedMsg.author.guildId).toBeUndefined();
        expect(fakeDMMsg.fixedMsg.author.roles).toBeUndefined();

        expect(fakeMsg.fixedMsg.replyMsg).toBeNull();
        expect(fakeMsg.fixedMsg.referencedMessage).toBeNull();

        const fakeWithReply = new FakeMsg({
            ...msg,
            replyMsg: {
                ...msg,
                id: "message-reply",
                content: "replied content"
            }
        });

        expect(fakeWithReply.fixedMsg.replyMsg).toMatchObject({
            id: "message-reply",
            content: "replied content",
            replyMsg: null
        });
        expect(fakeWithReply.fixedMsg.referencedMessage).toBe(fakeWithReply.fixedMsg.replyMsg);

        expect(JSON.parse(FakeMsg.reply({ content: "reply" }, msg))).toEqual({
            content: "reply"
        });
    });
});
