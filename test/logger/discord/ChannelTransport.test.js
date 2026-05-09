import { describe, expect, test } from "vitest";
import ChannelTransport from "../../../src/logger/discord/ChannelTransport.js";

describe("ChannelTransport", () => {
    test("sends logs to provided channels and resolves channels from a client cache", async () => {
        const sent = [];
        const provided = new ChannelTransport({
            channel: {
                id: "1",
                send: async log => sent.push(log)
            }
        });

        await provided.sendLog({ content: "hello" });
        expect(sent).toEqual([{ content: "hello" }]);

        const cachedChannel = {
            id: "2",
            send: async () => {}
        };
        const resolved = new ChannelTransport({
            client: {
                channels: {
                    cache: new Map([["2", cachedChannel]])
                }
            },
            channelId: "2"
        });

        expect(resolved.channel).toBe(cachedChannel);
        expect(resolved.getDisabledMessage()).toContain("Disabled");
        resolved.close();
        provided.close();
    });
});

describe("Merged Branch Coverage", () => {
    describe("ChannelTransport branch coverage", () => {
        test("throws when resolving channels without a valid cache hit", () => {
            expect(() => new ChannelTransport({})).toThrow("client object and a channel id must be provided");

            expect(
                () =>
                    new ChannelTransport({
                        client: {
                            channels: {
                                cache: new Map()
                            }
                        },
                        channelId: "missing"
                    })
            ).toThrow("Channel not found");
        });
    });
});
