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

const streamPath = model => `/v1beta/models/${model}:streamGenerateContent`,
    generatePath = model => `/v1beta/models/${model}:generateContent`;

const askerId = "100000000000000001",
    clickerId = "100000000000000002";

let runtime, server;

afterEach(async () => {
    await cleanupRuntime(runtime);
    await server?.close();

    runtime = null;
    server = null;
});

const call = (name, args, extra = {}) => ({ functionCall: { name, args, ...extra } });
const chunk = (parts, extra = {}) => ({ candidates: [{ content: { role: "model", parts }, ...extra }] });
const usage = (tokens, reasoning = 0) => ({
    usageMetadata: { totalTokenCount: tokens, thoughtsTokenCount: reasoning }
});

const sse = (...events) => ({
    headers: { "content-type": "text/event-stream" },
    body: events.map(event => `data: ${JSON.stringify(event)}\r\n\r\n`).join("")
});

const calls = (parts, tokens = 100, reasoning = 0) =>
    sse(chunk(parts), { ...chunk([], { finishReason: "STOP" }), ...usage(tokens, reasoning) });

const answer = (pieces, tokens = 100, reasoning = 0) =>
    sse(...pieces.map(text => chunk([{ text }])), {
        ...chunk([], { finishReason: "STOP" }),
        ...usage(tokens, reasoning)
    });

const extras = (followUps, sources, tokens = 50) => ({
    json: {
        candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify({ followUps, sources }) }] } }],
        ...usage(tokens)
    }
});

async function setup(script, options = {}) {
    const bodies = [];

    const route = path => ({
        [`POST ${path}`]: ({ body, req }) => {
            bodies.push({ path, key: req.headers["x-goog-api-key"], body: JSON.parse(body) });
            return script.shift();
        }
    });

    server = await createHttpStubServer({
        ...route(streamPath("test-model")),
        ...route(generatePath("test-model")),
        ...route(streamPath("fallback-model")),
        ...route(generatePath("fallback-model")),
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
                sources: options.sources?.(server.url) ?? [],
                ...options.ai
            }
        },
        auth: { geminiKey: "test-key" },
        discordOverrides: {
            fetchMember: async (guild, id) => createDiscordMember(createDiscordUser({ id }), { guildId: guild.id }),
            ...options.discordOverrides
        }
    });

    return bodies;
}

function createSentMessage(id) {
    const msg = {
        id,
        guild: { id: "guild-1", name: "Test Guild" },
        channel: { id: "channel-1" },
        payloads: [],
        edit: async data => (msg.payloads.push(data), msg)
    };

    return msg;
}

function createRecorder() {
    const sent = [],
        msg = createSentMessage("answer-1");

    const handler = {
        reply: async (_, data) => (sent.push(data), msg),
        contextReply: async (_, data) => (sent.push(data), msg),
        editFromContext: async (_, data) => (sent.push(data), msg),
        getReply: () => null
    };

    return { sent, msg, handler };
}

function createAskContext(question, recorder, overrides = {}) {
    const author = createDiscordUser({ id: askerId, createdAt: new Date(0) }),
        member = createDiscordMember(author, {
            guildId: "guild-1",
            joinedAt: new Date(0),
            roles: { cache: new Map([["role-1", { id: "role-1", name: "Member" }]]) }
        });

    const msg = createDiscordMessage(`%a ${question}`, { author, member, ...overrides });

    return createDiscordCommandContext(getCommand(runtime, "a"), question, {
        msg,
        handler: recorder.handler,
        replyMsg: overrides.replyMsg
    });
}

function createClick(customId, user, message) {
    const reply = createSentMessage("followup-1");

    const interaction = {
        customId,
        user,
        member: createDiscordMember(user, { guildId: "guild-1" }),
        guild: message.guild,
        channel: message.channel,
        message,
        replied: false,
        deferred: false,
        isMessageComponent: () => true,
        isModalSubmit: () => false,
        isRepliable: () => true,
        deferReply: async () => {
            interaction.deferred = true;
        },
        reply: async data => {
            interaction.replied = true;
            reply.payloads.push(data);

            return reply;
        },
        editReply: async data => (reply.payloads.push(data), reply)
    };

    return { interaction, reply };
}

function buttonsOf(payload) {
    return payload.components.flatMap(row => row.toJSON().components);
}

function embedOf(payload) {
    const embed = payload.embeds[0];
    return typeof embed.toJSON === "function" ? embed.toJSON() : embed;
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

    test("streams an answer with verified sources, follow-up buttons and token usage", async () => {
        const script = [
            calls(
                [
                    call("tri_search", { query: "steel" }, { id: "c1" }),
                    call("unit_convert", { value: 144, from: "mB/t", to: "B/s" }, { id: "c2" })
                ],
                1000,
                20
            ),
            answer(["Use the **EBF**", " to make steel. 144 mB/t is 2.88 B/s."], 400, 10),
            extras(["What coils does the EBF need?"], ["tag:steel", "https://invented.test/page"], 100)
        ];

        const bodies = await setup(script);
        await addTag(runtime, "steel", "Make steel in the EBF at 1000K.");

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("how do I make steel", recorder));

        expect(script).toEqual([]);
        expect(bodies.map(entry => entry.path)).toEqual([
            streamPath("test-model"),
            streamPath("test-model"),
            generatePath("test-model")
        ]);

        expect(bodies[0].key).toBe("test-key");
        expect(bodies[0].body.toolConfig.functionCallingConfig.mode).toBe("AUTO");
        expect(bodies[0].body.generationConfig.thinkingConfig.thinkingLevel).toBe("minimal");
        expect(bodies[0].body.systemInstruction.parts[0].text).toContain(`<@${askerId}>`);
        expect(bodies[0].body.systemInstruction.parts[0].text).toContain("## ANSWER FORMAT");

        const [search, convert] = bodies[1].body.contents.at(-1).parts.map(part => part.functionResponse);

        expect(search.id).toBe("c1");
        expect(search.response.results.tags[0]).toMatchObject({ source: "tag:steel", name: "steel" });
        expect(convert.response).toMatchObject({ result: 2.88, output: "2.88 B/s" });

        const finishBody = bodies[2].body,
            finishInput = JSON.parse(finishBody.contents[0].parts[0].text);

        expect(finishBody.generationConfig.responseMimeType).toBe("application/json");
        expect(finishInput.question).toBe("how do I make steel");
        expect(finishInput.answer).toBe("Use the **EBF** to make steel. 144 mB/t is 2.88 B/s.");
        expect(finishInput.candidates).toContain("tag:steel");

        expect(recorder.sent[0]).toBe(":hourglass_flowing_sand: Processing command...");
        expect(recorder.sent[1].content).toBeUndefined();
        expect(embedOf(recorder.sent[1])).toEqual({
            author: { name: "Test Rabbit - Thinking...", icon_url: "https://example.test/icon.png" },
            description: "▶️ *Thinking...*"
        });

        expect(embedOf(recorder.sent.at(-1))).toEqual({
            author: { name: "Test Rabbit", icon_url: "https://example.test/icon.png" },
            color: 0x75fa4c,
            description: "Use the **EBF** to make steel. 144 mB/t is 2.88 B/s.\n\nSources:\n1. tag:steel",
            footer: { text: "Models: test-model | 1,500 tok, 30 reasoning" }
        });

        const [button] = buttonsOf(recorder.sent.at(-1));

        expect(button.label).toBe("What coils does the EBF need?");
        expect(button.custom_id).toMatch(/^ai:followup:0:/);
    });

    test("answers without follow-ups have no buttons", async () => {
        await setup([answer(["Hi!"]), extras([], [])]);

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("hello", recorder));

        expect(recorder.sent.at(-1).components).toEqual([]);
        expect(runtime.client.interactionHandler.tracker.items.size).toBe(0);
    });

    test("follow-up buttons answer as the clicking user with conversation history", async () => {
        const script = [
            answer(["First answer."]),
            extras(["Tell me more", "Something else"], []),
            answer(["More details."]),
            extras([], [])
        ];

        const bodies = await setup(script, { loadVMs: true });

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("hello", recorder));

        const buttons = buttonsOf(recorder.sent.at(-1));
        expect(buttons.map(button => button.label)).toEqual(["Tell me more", "Something else"]);

        const clicker = createDiscordUser({ id: clickerId, username: "neeve" }),
            sessionId = buttons[0].custom_id.split(":").at(-1);

        const unknown = createClick(`ai:followup:5:${sessionId}`, clicker, recorder.msg);
        await expect(runtime.client.interactionHandler.execute(unknown.interaction)).resolves.toBe(false);

        const click = createClick(buttons[0].custom_id, clicker, recorder.msg);
        await expect(runtime.client.interactionHandler.execute(click.interaction)).resolves.toBe(true);

        const body = bodies[2].body,
            toolNames = body.tools[0].functionDeclarations.map(decl => decl.name);

        expect(body.contents.map(content => content.role)).toEqual(["user", "model", "user"]);
        expect(body.contents[1].parts[0].text).toBe("First answer.");
        expect(body.contents.at(-1).parts[0].text).toBe("Tell me more");
        expect(body.systemInstruction.parts[0].text).toContain(`<@${clickerId}>`);
        expect(toolNames).not.toContain("execute_javascript");
        expect(toolNames).not.toContain("tag_call");

        const payloads = click.reply.payloads;

        expect(embedOf(payloads[0]).author.name).toBe("Test Rabbit - Thinking...");
        expect(embedOf(payloads.at(-1)).description).toBe("More details.");
        expect(payloads.at(-1).components).toEqual([]);
    });

    test("follow-up buttons on expired answers report that they expired", async () => {
        await setup([answer(["First answer."]), extras(["Tell me more"], [])]);

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("hello", recorder));

        const [button] = buttonsOf(recorder.sent.at(-1));
        runtime.client.interactionHandler.unregisterSession(button.custom_id.split(":").at(-1));

        const click = createClick(button.custom_id, createDiscordUser({ id: clickerId }), recorder.msg);
        await expect(runtime.client.interactionHandler.execute(click.interaction)).resolves.toBe(false);

        expect(click.reply.payloads[0].content).toContain("expired");
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
            calls([
                call("execute_javascript", { code: "const perSec = 144 * 20; perSec" }),
                call("search_messages", { query: "ebf" }),
                call("search_messages", { query: ".*", isRegex: true }),
                call("get_asking_user", {})
            ]),
            answer(["2880."]),
            extras([], ["https://discord.com/channels/1/2/3"])
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
        expect(user).toMatchObject({ id: askerId, roles: ["Member"] });

        expect(fetchCalls[0].options).toEqual({ checkAccess: true, user_id: askerId });
        expect(embedOf(recorder.sent.at(-1)).description).toBe(
            "2880.\n\nSources:\n1. https://discord.com/channels/1/2/3"
        );
    });

    test("forces a text answer on the last step", async () => {
        const script = [
            calls([call("unit_convert", { value: 1, from: "B", to: "mB" })]),
            answer(["1000 mB."]),
            extras([], [])
        ];

        const bodies = await setup(script, { ai: { maxSteps: 2 } });

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("convert", recorder));

        expect(bodies[0].body.toolConfig.functionCallingConfig.mode).toBe("AUTO");
        expect(bodies[1].body.toolConfig.functionCallingConfig.mode).toBe("NONE");
        expect(embedOf(recorder.sent.at(-1)).description).toBe("1000 mB.");
    });

    test("falls back to the next model and retries without thinking config", async () => {
        const script = [
            { statusCode: 400, json: { error: { message: "Thinking level is not supported for this model." } } },
            { statusCode: 429, json: { error: { message: "Resource exhausted." } } },
            answer(["ok"], 10),
            extras([], [], 5)
        ];

        const bodies = await setup(script, { models: ["test-model", "fallback-model"] });

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("hi", recorder));

        expect(bodies.map(entry => entry.path)).toEqual([
            streamPath("test-model"),
            streamPath("test-model"),
            streamPath("fallback-model"),
            generatePath("fallback-model")
        ]);

        expect(bodies[1].body.generationConfig).toBeUndefined();
        expect(embedOf(recorder.sent.at(-1)).footer.text).toBe("Models: fallback-model | 15 tok, 0 reasoning");
    });

    test("reports quota, key and empty answer errors in the embed", async () => {
        const script = [
            { statusCode: 429, json: { error: { message: "Resource exhausted" } } },
            { statusCode: 401, json: { error: { message: "Bad key", status: "ACCESS_TOKEN_TYPE_UNSUPPORTED" } } },
            sse({ ...chunk([], { finishReason: "SAFETY" }), ...usage(5) })
        ];

        await setup(script);

        const results = [];

        for (let i = 0; i < 3; i++) {
            const recorder = createRecorder();
            await getCommand(runtime, "a").handler(createAskContext("hi", recorder));

            results.push(embedOf(recorder.sent.at(-1)));
        }

        expect(results.map(embed => embed.color)).toEqual([0xed4245, 0xed4245, 0xed4245]);
        expect(results[0].description).toContain("quota is used up");
        expect(results[1].description).toContain("AIza");
        expect(results[2].description).toContain("The model returned no answer (SAFETY)");
    });

    test("searches configured questbook sources and cites quest details", async () => {
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
            calls([call("tri_search", { query: "steel", scope: "questbook" })]),
            calls([call("tri_search", { questDetails: ["q1"] })]),
            answer(["Do **Steel Age**."]),
            extras([], ["questbook:q1"])
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

        expect(embedOf(recorder.sent.at(-1)).description).toBe("Do **Steel Age**.\n\nSources:\n1. questbook:q1");
    });
});
