import { describe, expect, test, vi } from "vitest";
import WebhookTransport from "../../../src/logger/discord/WebhookTransport.js";

vi.mock("discord.js", async importOriginal => {
    const actual = await importOriginal();

    return {
        ...actual,
        WebhookClient: vi.fn(function WebhookClientMock({ id, token, client }) {
            return {
                id,
                token,
                client,
                url: `https://discord.com/api/webhooks/${id}/${token}`,
                send: vi.fn(),
                destroy: vi.fn()
            };
        })
    };
});

describe("WebhookTransport", () => {
    test("builds webhook clients from urls and closes them cleanly", async () => {
        const transport = new WebhookTransport({
            url: "https://discord.com/api/webhooks/123/token_456"
        });

        await transport.sendLog({ content: "hello" });
        expect(transport.webhookId).toBe("123");
        expect(transport.webhookToken).toBe("token_456");

        transport.close();
        expect(() => new WebhookTransport({ url: "bad-url" })).toThrow("Invalid webhook url");
    });
});

describe("Merged Branch Coverage", () => {
    describe("WebhookTransport branch coverage", () => {
        test("accepts provided webhook objects and validates missing webhook urls", () => {
            const webhook = {
                id: "321",
                token: "provided_token",
                url: "https://discord.com/api/webhooks/321/provided_token",
                destroy: vi.fn()
            };

            const transport = new WebhookTransport({
                webhook
            });

            expect(transport.webhook).toBe(webhook);
            expect(transport.webhookId).toBe("321");
            expect(transport.webhookToken).toBe("provided_token");
            expect(transport.getDisabledMessage()).toBe("Disabled webhook transport.");

            transport.onClose();
            expect(webhook.destroy).toHaveBeenCalledOnce();

            expect(() => new WebhookTransport({ webhook: null })).toThrow("a webhook url must be provided");
        });
    });
});
