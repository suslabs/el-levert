import { DiscordAPIError } from "discord.js";
import { describe, expect, test, vi, afterEach } from "vitest";
import BaseDiscordTransport from "../../../src/logger/discord/BaseDiscordTransport.js";

class TestTransport extends BaseDiscordTransport {
    static $name = "discord.test";
    static _disableCodes = [12345];

    init() {
        this.sent = [];
        this.initialized = true;
    }

    async sendLog(log) {
        this.sent.push(log);
    }

    getDisabledMessage() {
        return "disabled";
    }
}

describe("BaseDiscordTransport", () => {
    test("formats log payloads and supports buffered sending", async () => {
        const transport = new TestTransport({
            sendInterval: 10,
            client: {
                user: {
                    displayName: "Bot",
                    displayAvatarURL: () => "https://example.com/avatar.png"
                }
            }
        });

        const callback = vi.fn();
        transport.log(
            {
                level: "info",
                message: "hello",
                timestamp: new Date(0).toISOString(),
                service: "tests",
                meta: {
                    scope: "logger"
                }
            },
            callback
        );

        expect(callback).toHaveBeenCalled();
        expect(transport._buffer).toHaveLength(1);

        await transport._sendLogs();
        expect(transport.sent).toHaveLength(1);
        expect(transport.sent[0].embeds[0].data.description).toContain("hello");

        transport.close();
    });

    test("disables itself on configured Discord API errors", () => {
        const transport = new TestTransport({});
        const err = Object.create(DiscordAPIError.prototype);
        err.code = 12345;

        transport._handleDiscordError(err);
        expect(transport.initialized).toBe(false);
    });
});

describe("Merged Branch Coverage", () => {
    class ImmediateTransport extends BaseDiscordTransport {
        static $name = "discord.immediate";

        init() {
            this.sent = [];
            this.initialized = true;
        }

        async sendLog(log) {
            this.sent.push(log);
        }
    }

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("BaseDiscordTransport branch coverage", () => {
        test("validates required transport shape and handles immediate logging branches", async () => {
            expect(
                () =>
                    new (class extends BaseDiscordTransport {
                        static $name = "";

                        async sendLog() {}
                    })({})
            ).toThrow("Discord transport must have a default name");

            expect(
                () =>
                    new (class extends BaseDiscordTransport {
                        static $name = "discord.missing";
                    })({})
            ).toThrow("Child class must have a sendLog function");

            const transport = new ImmediateTransport({
                sendInterval: 0
            });

            const callback = vi.fn();
            transport.log(
                {
                    level: "info",
                    message: "hello"
                },
                callback
            );

            await new Promise(resolve => setImmediate(resolve));

            expect(callback).toHaveBeenCalledOnce();
            expect(transport.sent).toHaveLength(1);

            transport.log(
                {
                    level: "info",
                    message: "skip",
                    discord: false
                },
                vi.fn()
            );

            expect(transport.sent).toHaveLength(1);

            transport.initialized = false;
            transport.log(
                {
                    level: "info",
                    message: "disabled"
                },
                vi.fn()
            );

            expect(transport.sent).toHaveLength(1);

            const formatted = transport._formatLog({
                level: "error",
                message: "x".repeat(5000),
                stack: "y".repeat(2500),
                meta: {
                    scope: "logger"
                },
                service: "tests"
            });

            expect(formatted.content).toContain("```js");
            expect(formatted.files).toHaveLength(1);

            const closeSpy = vi.spyOn(transport, "close");
            transport._handleDiscordError(new Error("plain failure"));

            expect(closeSpy).not.toHaveBeenCalled();

            transport._sendLogs();
            transport.close();
        });
    });
});
