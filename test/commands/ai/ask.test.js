import { afterEach, describe, expect, test } from "vitest";

import createHttpStubServer from "../../helpers/httpStubServer.js";
import { createDiscordMember, createDiscordMessage, createDiscordUser } from "../../helpers/discordStubs.js";
import {
    addTag,
    cleanupRuntime,
    createCommandRuntime,
    createDiscordCommandContext,
    getCommand
} from "../../helpers/commandHarness.js";

const geminiPath = "/v1beta/models/test-model:generateContent",
    fallbackPath = "/v1beta/models/fallback-model:generateContent";

let runtime, server;

afterEach(async () => {
    await cleanupRuntime(runtime);
    await server?.close();

    runtime = null;
    server = null;
});

const call = (name, args, extra = {}) => ({ functionCall: { name, args, ...extra } });
const respond = (...parts) => ({ json: { candidates: [{ content: { role: "model", parts }, finishReason: "STOP" }] } });

async function setup(script, options = {}) {
    const bodies = [];

    server = await createHttpStubServer({
        [`POST ${geminiPath}`]: ({ body, req }) => {
            bodies.push({ path: geminiPath, key: req.headers["x-goog-api-key"], body: JSON.parse(body) });
            return script.shift();
        },
        [`POST ${fallbackPath}`]: ({ body }) => {
            bodies.push({ path: fallbackPath, body: JSON.parse(body) });
            return script.shift();
        },
        ...options.routes
    });

    runtime = await createCommandRuntime({
        loadHandlers: true,
        loadVMs: options.loadVMs ?? false,
        config: {
            enableAI: true,
            enableEval: options.loadVMs ?? false,
            ai: {
                endpoint: `${server.url}/v1beta`,
                models: options.models ?? ["test-model"],
                sources: options.sources?.(server.url) ?? []
            }
        },
        auth: { geminiKey: "test-key" },
        discordOverrides: options.discordOverrides
    });

    return bodies;
}

function createRecorder() {
    const sent = [];

    const handler = {
        contextReply: async (_, data) => (sent.push({ type: "reply", data }), { id: "answer-1", components: [] }),
        editFromContext: async (_, data) => (sent.push({ type: "edit", data }), { id: "answer-1", components: [] }),
        getReply: () => null
    };

    return { sent, handler };
}

function createAskContext(question, recorder, overrides = {}) {
    const author = createDiscordUser({ id: "100000000000000001", createdAt: new Date(0) }),
        member = createDiscordMember(author, {
            guildId: "guild-1",
            joinedAt: new Date(0),
            roles: { cache: new Map([["role-1", { id: "role-1", name: "Member" }]]) }
        });

    const msg = createDiscordMessage(`%a ${question}`, { author, member, ...overrides });

    return createDiscordCommandContext(getCommand(runtime, "a"), question, { msg, handler: recorder.handler });
}

function createButtonInteraction(customId, message) {
    const user = createDiscordUser({ id: "100000000000000002", username: "neeve", createdAt: new Date(0) }),
        replies = [];

    const interaction = {
        customId,
        user,
        member: null,
        channel: message.channel,
        guild: { id: "guild-1", name: "Test Guild" },
        guildId: "guild-1",
        message,
        deferred: false,
        replied: false,
        isMessageComponent: () => true,
        isModalSubmit: () => false,
        isRepliable: () => true,
        deferReply: async () => {
            interaction.deferred = true;
        },
        editReply: async data => (replies.push(data), { id: "answer-2", components: [] }),
        reply: async data => (replies.push(data), { id: "answer-2", components: [] }),
        followUp: async data => (replies.push(data), { id: "answer-2", components: [] })
    };

    return { interaction, replies };
}

describe("a command", () => {
    test("isn't loaded when AI is disabled", async () => {
        runtime = await createCommandRuntime({});
        expect(runtime.client.commandManager.searchCommands("a")).toBeFalsy();
    });

    test("shows usage for an empty question", async () => {
        await setup([]);

        const recorder = createRecorder(),
            out = await getCommand(runtime, "a").handler(createAskContext("", recorder));

        expect(out).toContain("question");
        expect(recorder.sent).toEqual([]);
    });

    test("answers with tag search, unit conversion, verified sources and follow-up buttons", async () => {
        const script = [
            respond(
                call("tri_search", { query: "steel" }, { id: "c1" }),
                call("unit_convert", { value: 144, from: "mB/t", to: "B/s" }, { id: "c2" })
            ),
            respond(
                call("final_response", {
                    finalAnswer: "Steel is made in the EBF. 144 mB/t is 2.88 B/s.",
                    followUps: ["What coils does the EBF need?"],
                    sources: ["tag:steel", "https://invented.test/page"]
                })
            )
        ];

        const bodies = await setup(script);
        await addTag(runtime, "steel", "Make steel in the EBF at 1000K.");

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("how do I make steel", recorder));

        expect(script).toEqual([]);
        expect(bodies[0].key).toBe("test-key");
        expect(bodies[0].body.toolConfig.functionCallingConfig.mode).toBe("ANY");
        expect(bodies[0].body.generationConfig.thinkingConfig.thinkingLevel).toBe("minimal");
        expect(bodies[0].body.systemInstruction.parts[0].text).toContain("<@100000000000000001>");

        const [search, convert] = bodies[1].body.contents.at(-1).parts.map(part => part.functionResponse);

        expect(search.id).toBe("c1");
        expect(search.response.results.tags[0]).toMatchObject({ source: "tag:steel", name: "steel" });
        expect(search.response.notes).toContain("No questbook/domain/glossary source is configured for this bot.");
        expect(convert.response).toMatchObject({ result: 2.88, output: "2.88 B/s" });

        expect(recorder.sent[0].type).toBe("reply");
        expect(recorder.sent[0].data.content).toBe("> how do I make steel");

        const final = recorder.sent.at(-1).data;

        expect(final.embeds[0].description).toBe("Steel is made in the EBF. 144 mB/t is 2.88 B/s.");
        expect(final.embeds[0].fields).toEqual([{ name: "Sources", value: "`tag:steel`" }]);
        expect(final.embeds[0].footer.text).toBe("test-model • tri_search, unit_convert");
        expect(final.components).toHaveLength(1);

        const button = final.components[0].toJSON().components[0];

        expect(button.label).toBe("What coils does the EBF need?");
        expect(button.custom_id).toMatch(/^ai:followup:0:/);
    });

    test("follow-up buttons answer as the clicker with conversation history", async () => {
        const script = [
            respond(call("final_response", { finalAnswer: "First answer.", followUps: ["Tell me more"], sources: [] })),
            respond(call("final_response", { finalAnswer: "More details.", followUps: [], sources: [] }))
        ];

        const bodies = await setup(script, { loadVMs: true });

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("hello", recorder));

        const first = recorder.sent.at(-1).data,
            customId = first.components[0].toJSON().components[0].custom_id;

        const answerMsg = createDiscordMessage("", {
            id: "answer-1",
            author: createDiscordUser({ id: "bot-id", bot: true }),
            embeds: [{ description: "First answer.", fields: [] }]
        });

        const { interaction, replies } = createButtonInteraction(customId, answerMsg);
        await runtime.client.interactionHandler.execute(interaction);

        const body = bodies.at(-1).body,
            toolNames = body.tools[0].functionDeclarations.map(decl => decl.name);

        expect(body.contents.map(content => content.role)).toEqual(["user", "model", "user"]);
        expect(body.contents.at(-1).parts[0].text).toBe("Tell me more");
        expect(body.systemInstruction.parts[0].text).toContain("<@100000000000000002>");
        expect(body.systemInstruction.parts[0].text).toContain("First answer.");
        expect(toolNames).not.toContain("execute_javascript");
        expect(toolNames).not.toContain("tag_call");

        expect(interaction.deferred).toBe(true);
        expect(replies.at(-1).embeds[0].description).toBe("More details.");
        expect(replies.at(-1).components).toEqual([]);
    });

    test("runs scripts in the eval sandbox and reads history the user can access", async () => {
        const fetchCalls = [];

        const history = [
            createDiscordMessage("the ebf is weird", {
                id: "m-2",
                url: "https://discord.com/channels/1/2/3",
                createdAt: new Date(1)
            }),
            createDiscordMessage("unrelated", {
                id: "m-1",
                url: "https://discord.com/channels/1/2/4",
                createdAt: new Date(0)
            })
        ];

        const script = [
            respond(
                call("execute_javascript", { code: "const perSec = 144 * 20; perSec" }),
                call("search_messages", { query: "ebf" }),
                call("search_messages", { query: ".*", isRegex: true }),
                call("get_asking_user", {})
            ),
            respond(call("final_response", { finalAnswer: "2880.", followUps: [], sources: [] }))
        ];

        const bodies = await setup(script, {
            loadVMs: true,
            discordOverrides: {
                fetchMessages: async (ch_id, options, fetchOptions) => {
                    fetchCalls.push({ ch_id, options, fetchOptions });
                    return new Map(history.map(msg => [msg.id, msg]));
                }
            }
        });

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("compute it", recorder));

        const [js, search, matchAll, user] = bodies[1].body.contents
            .at(-1)
            .parts.map(part => part.functionResponse.response);

        expect(js.output).toBe("2880");
        expect(search.count).toBe(1);
        expect(search.messages[0].content).toBe("the ebf is weird");
        expect(matchAll.error).toContain("Match-all");
        expect(user).toMatchObject({ id: "100000000000000001", roles: ["Member"] });

        expect(fetchCalls[0].options).toEqual({ checkAccess: true, user_id: "100000000000000001" });
    });

    test("falls back to the next model and retries without thinking config", async () => {
        const script = [
            { statusCode: 400, json: { error: { message: "Thinking level is not supported for this model." } } },
            { statusCode: 429, json: { error: { message: "Resource exhausted." } } },
            respond(call("final_response", { finalAnswer: "ok", followUps: [], sources: [] }))
        ];

        const bodies = await setup(script, { models: ["test-model", "fallback-model"] });

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("hi", recorder));

        expect(bodies.map(entry => entry.path)).toEqual([geminiPath, geminiPath, fallbackPath]);
        expect(bodies[1].body.generationConfig).toBeUndefined();
        expect(recorder.sent.at(-1).data.embeds[0].footer.text).toBe("fallback-model");
    });

    test("reports quota and key errors", async () => {
        const script = [
            { statusCode: 429, json: { error: { message: "Resource exhausted" } } },
            { statusCode: 401, json: { error: { message: "Bad key", status: "ACCESS_TOKEN_TYPE_UNSUPPORTED" } } }
        ];

        await setup(script);

        const quota = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("hi", quota));

        expect(quota.sent.at(-1).data.content).toContain("quota is used up");

        const key = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("hi", key));

        expect(key.sent.at(-1).data.content).toContain("AIza");
    });

    test("searches configured questbook sources and returns quest details", async () => {
        const questbook = {
            entries: [
                {
                    id: "q1",
                    title: "Steel Age",
                    text: "Make steel. ".repeat(40),
                    tasks: ["16x steel ingot"],
                    prereqs: ["q0"]
                },
                { id: "q0", title: "Iron Age", text: "Get iron." }
            ]
        };

        const script = [
            respond(call("tri_search", { query: "steel", scope: "questbook" })),
            respond(call("tri_search", { questDetails: ["q1"] })),
            respond(call("final_response", { finalAnswer: "Do Steel Age.", followUps: [], sources: ["questbook:q1"] }))
        ];

        const bodies = await setup(script, {
            sources: url => [{ kind: "questbook", format: "json", url: `${url}/questbook.json` }],
            routes: { "GET /questbook.json": () => ({ json: questbook }) }
        });

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("how do I get steel", recorder));

        const search = bodies[1].body.contents.at(-1).parts[0].functionResponse.response,
            details = bodies[2].body.contents.at(-1).parts[0].functionResponse.response;

        expect(search.results).toEqual({
            questbook: [expect.objectContaining({ source: "questbook:q1", title: "Steel Age", truncated: true })]
        });

        expect(details.entries[0]).toMatchObject({
            source: "questbook:q1",
            tasks: ["16x steel ingot"],
            prereqs: [{ id: "q0", title: "Iron Age" }]
        });

        expect(recorder.sent.at(-1).data.embeds[0].fields).toEqual([{ name: "Sources", value: "`questbook:q1`" }]);
    });
});
