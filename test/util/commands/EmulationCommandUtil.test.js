import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocked = vi.hoisted(() => ({
    client: {
        owner: "owner-id",
        emulateMessage: vi.fn().mockImplementation(async (_content, override) => ({
            id: "msg-1",
            author: {
                id: override.author?.id ?? override.member?.id ?? "owner-id"
            }
        }))
    }
}));

vi.mock("../../../src/LevertClient.js", () => ({
    getClient: () => mocked.client
}));

import EmulationCommandUtil from "../../../src/util/commands/EmulationCommandUtil.js";

let tempDir;
let oldProjRoot;

beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "el-levert-emulation-util-"));
    oldProjRoot = globalThis.projRoot;
    globalThis.projRoot = tempDir;
});

afterEach(async () => {
    globalThis.projRoot = oldProjRoot;
    await fs.rm(tempDir, { recursive: true, force: true });
});

describe("EmulationCommandUtil", () => {
    test("builds cli argument names from camel case keys", () => {
        expect(EmulationCommandUtil.getMessageCliArguments().map(arg => arg.aliases[0])).toEqual([
            "msg-id",
            "msg-type",
            "msg-reactions",
            "msg-attachments",
            "msg-embeds",
            "msg-mentions",
            "author-id",
            "author-username",
            "author-global-name",
            "author-bot",
            "guild-id",
            "guild-name",
            "channel-id",
            "channel-type",
            "channel-name",
            "channel-last-message-id"
        ]);
        expect(EmulationCommandUtil.getTagCliArguments().map(arg => arg.aliases[0])).toEqual([
            "tag-name",
            "tag-alias-name",
            "tag-body",
            "tag-bin",
            "tag-owner",
            "tag-args",
            "tag-type",
            "tag-language"
        ]);
    });

    test("returns tag emulation state and options together", () => {
        expect(
            EmulationCommandUtil.getCliTagOptions({
                arg: () => ({
                    tagName: "faux"
                })
            })
        ).toEqual([
            true,
            {
                name: "faux"
            }
        ]);
        expect(EmulationCommandUtil.getTagOptions({})).toEqual([false, {}]);
    });

    test("builds websocket message schema from discord client emulation fields", () => {
        const schema = EmulationCommandUtil.getMessageSchema();

        expect(Object.keys(schema.properties)).toEqual(["message", "author", "guild", "channel", "member"]);
        expect(schema.properties.author.properties).toHaveProperty("id");
        expect(schema.properties.member.properties).not.toHaveProperty("user");
    });

    test("normalizes websocket message options to the discord client shape", () => {
        expect(
            EmulationCommandUtil.normalizeMessageOptions({
                author: {
                    id: "11111",
                    username: "author-user"
                },
                member: {
                    id: "11111",
                    nick: "member-nick",
                    user: {
                        id: "legacy-user"
                    }
                },
                message: {
                    type: 4,
                    mentions: {
                        everyone: true
                    },
                    ignored: true
                },
                ignored: true
            })
        ).toEqual({
            author: {
                id: "11111",
                username: "author-user"
            },
            member: {
                id: "11111",
                nick: "member-nick"
            },
            message: {
                type: 4,
                mentions: {
                    everyone: true
                }
            }
        });
    });

    test("normalizes cli message options into nested emulation payloads", () => {
        expect(
            EmulationCommandUtil.normalizeCliMessageOptions({
                msgId: "712345678901234567",
                authorId: "11111",
                authorUsername: "author-user",
                authorGlobalName: "author-global",
                authorBot: true,
                guildId: "22222",
                guildName: "guild-name",
                channelId: "33333",
                channelType: 0,
                channelName: "channel-name",
                channelLastMessageId: "44444",
                msgType: 4,
                msgReactions: [
                    {
                        emoji: {
                            name: "🔥"
                        }
                    }
                ],
                msgMentions: {
                    everyone: true
                },
                msgAttachments: [
                    {
                        url: "https://example.com/a.txt"
                    }
                ],
                msgEmbeds: [
                    {
                        description: "embed body"
                    }
                ]
            })
        ).toEqual({
            author: {
                id: "11111",
                username: "author-user",
                globalName: "author-global",
                bot: true
            },
            guild: {
                id: "22222",
                name: "guild-name"
            },
            channel: {
                id: "33333",
                type: 0,
                name: "channel-name",
                lastMessageId: "44444"
            },
            message: {
                id: "712345678901234567",
                type: 4,
                reactions: [
                    {
                        emoji: {
                            name: "🔥"
                        }
                    }
                ],
                attachments: [
                    {
                        url: "https://example.com/a.txt"
                    }
                ],
                embeds: [
                    {
                        description: "embed body"
                    }
                ],
                mentions: {
                    everyone: true
                }
            }
        });
    });

    test("normalizes message input before emulateMessage", async () => {
        const res = await EmulationCommandUtil.createMessageInput("fallback content", {
            member: {
                id: "22222",
                user: {
                    id: "legacy-user"
                }
            },
            message: {
                type: 1
            },
            ignored: true
        });

        expect(res).toEqual({
            override: {
                member: {
                    id: "22222"
                },
                message: {
                    type: 1
                }
            },
            user_id: "22222",
            emulatedMsg: {
                id: "msg-1",
                author: {
                    id: "22222"
                }
            }
        });
        expect(mocked.client.emulateMessage).toHaveBeenCalledWith("fallback content", {
            member: {
                id: "22222"
            },
            message: {
                type: 1
            }
        });
    });

    test("loads strong absolute paths and falls back on missing relative ones", async () => {
        const filePath = path.join(tempDir, "script.js"),
            relPath = "missing.js";

        await fs.writeFile(filePath, "return 1;");

        await expect(
            EmulationCommandUtil.resolveGuessedPathBody(filePath, {
                name: "script"
            })
        ).resolves.toMatchObject({
            body: "return 1;",
            guessedPath: true,
            isScript: true,
            language: "js"
        });

        await expect(
            EmulationCommandUtil.resolveGuessedPathBody(relPath, {
                name: "script"
            })
        ).resolves.toMatchObject({
            body: "missing.js",
            guessedPath: false,
            err: null
        });
    });

    test("returns validation errors for missing absolute paths and directories", async () => {
        const missingPath = path.join(tempDir, "missing.js"),
            dirPath = path.join(tempDir, "nested");

        await fs.mkdir(dirPath);

        await expect(
            EmulationCommandUtil.resolveGuessedPathBody(missingPath, {
                name: "script"
            })
        ).resolves.toMatchObject({
            body: null,
            err: {
                level: "warn",
                message: "The provided script path doesn't point to an existing file"
            }
        });

        await expect(
            EmulationCommandUtil.resolveGuessedPathBody(dirPath, {
                name: "script"
            })
        ).resolves.toMatchObject({
            body: null,
            err: {
                level: "warn",
                message: "The provided script path points to a directory, not a file"
            }
        });
    });
});
