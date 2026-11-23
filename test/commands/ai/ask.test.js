import { afterEach, describe, expect, test, vi } from "vitest";

import createHttpStubServer from "../../helpers/httpStubServer.js";
import { createDiscordMember, createDiscordMessage, createDiscordUser } from "../../helpers/discordStubs.js";
import {
    addTag,
    cleanupRuntime,
    createCommandRuntime,
    createDiscordCommandContext,
    getCommand
} from "../../helpers/commandHarness.js";

import Util from "../../../src/util/Util.js";

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

    const models = new Set(["test-model", "fallback-model", ...(options.models ?? [])]);

    server = await createHttpStubServer({
        ...Object.assign(
            {},
            ...Array.from(models, model => ({ ...route(streamPath(model)), ...route(generatePath(model)) }))
        ),
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
        auth: options.auth ?? { geminiKey: "test-key" },
        discordOverrides: {
            fetchMember: async (guild, id) => createDiscordMember(createDiscordUser({ id }), { guildId: guild.id }),
            ...options.discordOverrides
        }
    });

    return bodies;
}

async function loadSources(definitions) {
    const { default: AISourceRegistry } = await import("../../../src/ai/sources/AISourceRegistry.js");

    const manager = runtime.client.aiManager;

    manager.sources = new AISourceRegistry(manager.http, manager.requestTimeout);
    await manager.sources.load(definitions);
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

    let replies = 0;

    const send = data => {
        replies++;
        sent.push(data);

        return msg;
    };

    const handler = {
        reply: async (_, data) => send(data),
        contextReply: async (_, data) => send(data),
        editFromContext: async (_, data) => (sent.push(data), msg),
        getReply: () => null
    };

    return {
        sent,
        msg,
        handler,
        get replies() {
            return replies;
        }
    };
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
        updated: false,
        isMessageComponent: () => true,
        isModalSubmit: () => false,
        isRepliable: () => true,
        deferReply: async () => {
            interaction.deferred = true;
        },
        deferUpdate: async () => {
            interaction.deferred = true;
            interaction.updated = true;
        },
        update: async data => {
            interaction.replied = true;
            message.payloads.push(data);

            return message;
        },
        reply: async data => {
            interaction.replied = true;
            reply.payloads.push(data);

            return reply;
        },
        editReply: async data => {
            const target = interaction.updated ? message : reply;
            target.payloads.push(data);

            return target;
        }
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
    test(
        "isn't loaded when AI is disabled",
        async () => {
            runtime = await createCommandRuntime({});
            expect(runtime.client.commandManager.searchCommands("a")).toBeFalsy();
        },
        30 / Util.durationSeconds.milli
    );

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
                    call("search_tags", { query: "steel" }, { id: "c1" }),
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
        expect(bodies[0].body.generationConfig.thinkingConfig.thinkingLevel).toBe("low");
        expect(bodies[2].body.generationConfig.thinkingConfig.thinkingLevel).toBe("minimal");
        expect(bodies[0].body.systemInstruction.parts[0].text).toContain(`<@${askerId}>`);
        expect(bodies[0].body.systemInstruction.parts[0].text).toContain("## ANSWER FORMAT");
        expect(bodies[0].body.tools[0].functionDeclarations.map(decl => decl.name)).not.toContain("search_recipes");

        const [search, convert] = bodies[1].body.contents.at(-1).parts.map(part => part.functionResponse);

        expect(search.id).toBe("c1");
        expect(Util.first(search.response.tags)).toMatchObject({ source: "tag:steel", name: "steel" });
        expect(convert.response).toMatchObject({ result: 2.88, output: "2.88 B/s" });

        const finishBody = bodies[2].body,
            finishInput = JSON.parse(finishBody.contents[0].parts[0].text);

        expect(finishBody.generationConfig.responseMimeType).toBe("application/json");
        expect(finishBody.generationConfig.responseSchema.properties.followUps).toMatchObject({
            minItems: 3,
            maxItems: 5
        });
        expect(finishInput.question).toBe("how do I make steel");
        expect(finishInput.answer).toBe("Use the **EBF** to make steel. 144 mB/t is 2.88 B/s.");
        expect(finishInput.candidates).toContain("tag:steel");

        expect(recorder.replies).toBe(1);
        expect(recorder.sent).not.toContain(":hourglass_flowing_sand: Processing command...");
        expect(recorder.sent[0].content).toBe("");
        expect(embedOf(recorder.sent[0])).toEqual({
            author: { name: "Test Rabbit - Thinking...", icon_url: "https://example.test/icon.png" },
            description: "💭 *Thinking...*"
        });

        expect(embedOf(recorder.sent.at(-1))).toEqual({
            author: { name: "Test Rabbit", icon_url: "https://example.test/icon.png" },
            color: 0x75fa4c,
            description:
                "Use the **EBF** to make steel. 144 mB/t is 2.88 B/s.\n\nSources:\n1. tag:steel\n\nFollow-ups:\n1. What coils does the EBF need?",
            footer: { text: expect.stringMatching(/^Models: test-model \| 1,500 tok, 30 reasoning \| \d+(\.\d)?s$/) }
        });

        const [button] = buttonsOf(recorder.sent.at(-1));

        expect(button.label).toBe("1");
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
            extras(["tell me more", "Something else?"], []),
            answer(["More details."]),
            extras([], [])
        ];

        const bodies = await setup(script, { loadVMs: true });

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("hello", recorder));

        const buttons = buttonsOf(recorder.sent.at(-1));
        expect(buttons.map(button => button.label)).toEqual(["1", "2"]);
        expect(embedOf(recorder.sent.at(-1)).description).toContain(
            "Follow-ups:\n1. Tell me more?\n2. Something else?"
        );

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
        expect(body.contents.at(-1).parts[0].text).toBe("Tell me more?");
        expect(body.systemInstruction.parts[0].text).toContain(`<@${clickerId}>`);
        expect(toolNames).not.toContain("execute_javascript");
        expect(toolNames).not.toContain("tag_call");

        const payloads = click.reply.payloads;

        expect(embedOf(payloads[0]).author.name).toBe("Test Rabbit - Thinking...");
        expect(embedOf(payloads.at(-1)).description).toBe("More details.");
        expect(payloads.at(-1).components).toEqual([]);

        const [hidden, restored] = recorder.msg.payloads;

        expect(hidden).toEqual({ components: [] });
        expect(restored.components.flatMap(row => row.toJSON().components).map(button => button.label)).toEqual([
            "1",
            "2"
        ]);
    });

    test("only the asker can use the follow-up buttons when followUpsAnyone is off", async () => {
        const script = [answer(["First answer."]), extras(["Tell me more"], []), answer(["More."]), extras([], [])];
        const bodies = await setup(script, { ai: { followUpsAnyone: false } });

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("hello", recorder));

        const [button] = buttonsOf(recorder.sent.at(-1));

        const other = createClick(button.custom_id, createDiscordUser({ id: clickerId }), recorder.msg);
        await runtime.client.interactionHandler.execute(other.interaction);

        expect(bodies).toHaveLength(2);
        expect(other.reply.payloads[0].content).toContain("Only the command caller");

        const asker = createClick(button.custom_id, createDiscordUser({ id: askerId }), recorder.msg);
        await expect(runtime.client.interactionHandler.execute(asker.interaction)).resolves.toBe(true);

        expect(script).toEqual([]);
        expect(embedOf(asker.reply.payloads.at(-1)).description).toBe("More.");
    });

    test("the asker's follow-ups replace the clicked answer when followUpsEditAnswer is on", async () => {
        const script = [answer(["First answer."]), extras(["Tell me more"], []), answer(["More."]), extras([], [])];
        await setup(script, { ai: { followUpsEditAnswer: true } });

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("hello", recorder));

        const [button] = buttonsOf(recorder.sent.at(-1)),
            sessionId = button.custom_id.split(":").at(-1);

        const click = createClick(button.custom_id, createDiscordUser({ id: askerId }), recorder.msg);
        await expect(runtime.client.interactionHandler.execute(click.interaction)).resolves.toBe(true);

        expect(click.reply.payloads).toEqual([]);

        const thinking = Util.first(recorder.msg.payloads);

        expect(buttonsOf(thinking).map(button => button.label)).toEqual(["Cancel"]);
        expect(thinking.attachments).toEqual([]);
        expect(embedOf(recorder.msg.payloads.at(-1)).description).toBe("More.");
        expect(runtime.client.interactionHandler.getSession(sessionId)).toBeNull();
    });

    test("other people's follow-ups get a new message even when followUpsEditAnswer is on", async () => {
        const script = [answer(["First answer."]), extras(["Tell me more"], []), answer(["More."]), extras([], [])];
        await setup(script, { ai: { followUpsEditAnswer: true } });

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("hello", recorder));

        const [button] = buttonsOf(recorder.sent.at(-1));

        const click = createClick(button.custom_id, createDiscordUser({ id: clickerId }), recorder.msg);
        await expect(runtime.client.interactionHandler.execute(click.interaction)).resolves.toBe(true);

        expect(script).toEqual([]);
        expect(embedOf(click.reply.payloads.at(-1)).description).toBe("More.");
        expect(click.reply.payloads.map(payload => payload.content)).toEqual([`<@${clickerId}>`, `<@${clickerId}>`]);
        expect(Util.first(click.reply.payloads).allowedMentions.users).toEqual([clickerId]);

        const [hidden, restored] = recorder.msg.payloads;

        expect(hidden).toEqual({ components: [] });
        expect(buttonsOf(restored).map(restoredButton => restoredButton.label)).toEqual(["1"]);
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

    test("replies to answers continue the conversation until the answer expires", async () => {
        const script = [
            answer(["First answer."]),
            extras([], []),
            answer(["Second answer."]),
            extras([], []),
            answer(["Third answer."]),
            extras([], [])
        ];

        const messages = new Map(),
            botUser = createDiscordUser({ id: "bot-id", bot: true });

        const bodies = await setup(script, {
            discordOverrides: { fetchMessage: async (_, id) => messages.get(id) ?? null }
        });

        const createSent = (id, data) => {
            const sent = createDiscordMessage("", {
                id,
                author: botUser,
                edit: async payload => setEmbeds(payload)
            });

            const setEmbeds = payload => {
                sent.embeds = payload.embeds.map(embed => ({ fields: [], ...embedOf({ embeds: [embed] }) }));
                return sent;
            };

            messages.set(id, setEmbeds(data));
            return sent;
        };

        const createUserMsg = (id, content, extra = {}) => {
            const msg = createDiscordMessage(content, {
                id,
                author: createDiscordUser({ id: askerId }),
                reply: async data => createSent(`${id}-answer`, data),
                ...extra
            });

            messages.set(id, msg);
            return msg;
        };

        const handler = runtime.client.commandHandler;
        runtime.client.client.user = botUser;

        const replyTo = messageId => ({ reference: { messageId } });

        await expect(handler.execute(createUserMsg("q-1", "%a hello"))).resolves.toBe(true);

        const followUp = createUserMsg("q-2", "and then?", replyTo("q-1-answer"));
        await expect(handler.execute(followUp)).resolves.toBe(true);

        const textsOf = body => body.contents.map(content => [content.role, content.parts[0].text]);

        expect(textsOf(bodies[2].body)).toEqual([
            ["user", "hello"],
            ["model", "First answer."],
            ["user", "and then?"]
        ]);

        expect(bodies[2].body.systemInstruction.parts[0].text).not.toContain("The question replies to a message");
        expect(messages.get("q-2-answer").embeds[0].description).toBe("Second answer.");

        const chained = createUserMsg("q-3", "and after that?", replyTo("q-2-answer"));
        await expect(handler.execute(chained)).resolves.toBe(true);

        expect(textsOf(bodies[4].body)).toEqual([
            ["user", "hello"],
            ["model", "First answer."],
            ["user", "and then?"],
            ["model", "Second answer."],
            ["user", "and after that?"]
        ]);
        expect(messages.get("q-3-answer").embeds[0].description).toBe("Third answer.");
        expect(script).toEqual([]);

        messages.get("q-3-answer").editedTimestamp = Date.now() - 2 * runtime.client.config.interactionTimeout;

        const expired = createUserMsg("q-4", "still there?", replyTo("q-3-answer"));
        await expect(handler.execute(expired)).resolves.toBe(false);

        const untracked = createUserMsg("q-5", "what about this?", replyTo("someone-else"));
        await expect(handler.execute(untracked)).resolves.toBe(false);
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

    test("keeps calling tools past the usual step limit when maxSteps is -1", async () => {
        const rounds = Array.from({ length: 8 }, () =>
            calls([call("unit_convert", { value: 1, from: "B", to: "mB" })])
        );
        const script = [...rounds, answer(["Done."]), extras([], [])];

        await setup(script, { ai: { maxSteps: -1 } });

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("convert a lot", recorder));

        expect(script).toEqual([]);
        expect(embedOf(recorder.sent.at(-1)).description).toBe("Done.");
    });

    test("forces a text answer on the last step and thinks harder while choosing tools", async () => {
        const script = [
            calls([call("unit_convert", { value: 1, from: "B", to: "mB" })]),
            answer(["1000 mB."]),
            extras([], [])
        ];

        const bodies = await setup(script, { ai: { maxSteps: 2 } });

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("convert", recorder));

        const modeOf = entry => [
            entry.body.toolConfig.functionCallingConfig.mode,
            entry.body.generationConfig.thinkingConfig.thinkingLevel
        ];

        expect(modeOf(bodies[0])).toEqual(["AUTO", "low"]);
        expect(modeOf(bodies[1])).toEqual(["NONE", "minimal"]);
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
        expect(embedOf(recorder.sent.at(-1)).footer.text).toMatch(/^Models: fallback-model \| 15 tok \| [\d.]+s$/);
    });

    test("switches to the next model when one gets overloaded mid-answer", async () => {
        const script = [
            calls([call("unit_convert", { value: 1, from: "B", to: "mB" })], 10),
            { statusCode: 503, json: { error: { message: "This model is currently experiencing high demand." } } },
            answer(["1 B is 1000 mB."], 20),
            extras([], [], 5)
        ];

        const bodies = await setup(script, { models: ["test-model", "fallback-model"] });

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("1 bucket in mB?", recorder));

        expect(bodies.map(entry => entry.path)).toEqual([
            streamPath("test-model"),
            streamPath("test-model"),
            streamPath("fallback-model"),
            generatePath("fallback-model")
        ]);

        const embed = embedOf(recorder.sent.at(-1));

        expect(embed.description).toBe("1 B is 1000 mB.");
        expect(embed.footer.text).toMatch(/^Models: test-model, fallback-model \| 35 tok \| [\d.]+s$/);
    });

    test("restarts an answer on the next model when the stream stops partway", async () => {
        const script = [
            sse(chunk([{ text: "Jeffrey Epstein is widely" }])),
            sse(chunk([{ text: "Half an" }]), { error: { code: 503, message: "Overloaded." } }),
            answer(["A complete answer."], 20),
            extras([], [], 5)
        ];

        const bodies = await setup(script, { models: ["test-model", "fallback-model", "third-model"] });

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("is he cool?", recorder));

        expect(script).toEqual([]);
        expect(bodies.map(entry => entry.path)).toEqual([
            streamPath("test-model"),
            streamPath("fallback-model"),
            streamPath("third-model"),
            generatePath("third-model")
        ]);

        const progress = recorder.sent.slice(0, -1).map(payload => embedOf(payload).description);
        expect(progress.at(-1)).not.toContain("Half an");

        const embed = embedOf(recorder.sent.at(-1));

        expect(embed.description).toBe("A complete answer.");
        expect(embed.footer.text).toMatch(/^Models: third-model \| /);
    });

    test("shows a short error without the raw response when every model is overloaded", async () => {
        const overloaded = {
            statusCode: 503,
            json: { error: { message: "This model is currently experiencing high demand." } }
        };
        await setup([overloaded, overloaded], { models: ["test-model", "fallback-model"] });

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("hi", recorder));

        const description = embedOf(recorder.sent.at(-1)).description;

        expect(description).toContain("All models are unavailable right now.");
        expect(description).toContain("Gemini is overloaded right now");
        expect(description).not.toContain("high demand");
    });

    test("tries the next API key when one runs out of quota and keeps using it", async () => {
        const script = [
            { statusCode: 429, json: { error: { message: "Resource exhausted." } } },
            answer(["ok"]),
            extras([], []),
            answer(["again"]),
            extras([], [])
        ];

        const bodies = await setup(script, { auth: { geminiKey: ["key-1", "key-2"] } });

        await getCommand(runtime, "a").handler(createAskContext("hi", createRecorder()));
        await getCommand(runtime, "a").handler(createAskContext("hi again", createRecorder()));

        expect(script).toEqual([]);
        expect(bodies.map(entry => entry.key)).toEqual(["key-1", "key-2", "key-2", "key-2", "key-2"]);
    });

    test("limits how often each user can ask", async () => {
        const bodies = await setup([answer(["ok"]), extras([], [])], {
            ai: { maxRequests: 1, rateLimitWindow: 60 * 1000 }
        });

        await getCommand(runtime, "a").handler(createAskContext("hi", createRecorder()));

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("hi again", recorder));

        expect(bodies).toHaveLength(2);
        expect(recorder.sent).toHaveLength(1);
        expect(recorder.sent[0]).toMatch(/You are asking too fast\. Please slow down! \(\*\*\d+s\*\*\)/);
    });

    test("still posts the answer when sources and follow-ups can't be added", async () => {
        const broken = { json: { candidates: [{ content: { parts: [{ text: "not json" }] } }] } };
        await setup([answer(["The answer."]), broken]);

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("hi", recorder));

        const final = recorder.sent.at(-1);

        expect(embedOf(final).description).toBe("The answer.");
        expect(final.components).toEqual([]);
    });

    test("reports a slow Gemini response as an error instead of crashing", async () => {
        const slow = () => new Promise(resolve => setTimeout(() => resolve(answer(["late"])), 1500));

        await setup([], {
            ai: { requestTimeout: 100 },
            routes: { [`POST ${streamPath("test-model")}`]: slow }
        });

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("hi", recorder));

        const embed = embedOf(recorder.sent.at(-1));

        expect(embed.color).toBe(0xed4245);
        expect(embed.description).toContain("Gemini took too long to respond.");
    });

    test("admins wait for slow Gemini responses", async () => {
        const slow = () => new Promise(resolve => setTimeout(() => resolve(answer(["Worth the wait."])), 300));

        await setup([extras([], [])], {
            ai: { requestTimeout: 100 },
            auth: { geminiKey: "test-key", owner: askerId },
            routes: { [`POST ${streamPath("test-model")}`]: slow }
        });

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("hi", recorder));

        expect(embedOf(recorder.sent.at(-1)).description).toBe("Worth the wait.");
    });

    test("admins skip the cooldown", async () => {
        const script = [answer(["ok"]), extras([], []), answer(["again"]), extras([], [])];

        await setup(script, {
            ai: { maxRequests: 1, rateLimitWindow: 60 * 1000 },
            auth: { geminiKey: "test-key", owner: askerId }
        });

        await getCommand(runtime, "a").handler(createAskContext("hi", createRecorder()));

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("hi again", recorder));

        expect(script).toEqual([]);
        expect(embedOf(recorder.sent.at(-1)).description).toBe("again");
    });

    test("the asker can cancel an answer with the cancel button", async () => {
        let release;
        const gate = new Promise(resolve => (release = resolve));

        await setup([], {
            routes: {
                [`POST ${streamPath("test-model")}`]: async () => {
                    await gate;
                    return answer(["Too late."]);
                }
            }
        });

        const recorder = createRecorder(),
            running = getCommand(runtime, "a").handler(createAskContext("slow question", recorder));

        await vi.waitFor(() => expect(recorder.sent).toHaveLength(1));

        const [cancel] = buttonsOf(recorder.sent[0]);
        expect(cancel.label).toBe("Cancel");

        const other = createClick(cancel.custom_id, createDiscordUser({ id: clickerId }), recorder.msg);
        await runtime.client.interactionHandler.execute(other.interaction);

        expect(other.reply.payloads[0].content).toContain("Only the command caller");

        const asker = createClick(cancel.custom_id, createDiscordUser({ id: askerId }), recorder.msg);
        await expect(runtime.client.interactionHandler.execute(asker.interaction)).resolves.toBe(true);

        await running;
        release();

        const cancelled = recorder.msg.payloads.at(-1);

        expect(embedOf(cancelled)).toMatchObject({
            color: 0xed4245,
            description: ":no_entry_sign: Thinking cancelled."
        });
        expect(cancelled.components).toEqual([]);
        expect(recorder.sent).toHaveLength(1);
        expect(runtime.client.interactionHandler.getSession(cancel.custom_id.split(":").at(-1))).toBeNull();
    });

    test("runs image tags and attaches the files they send", async () => {
        const script = [
            calls([call("tag_call", { name: "caption", args: ["when the", "code works"] })]),
            answer(["Captioned it."]),
            extras([], [])
        ];

        const bodies = await setup(script, { loadVMs: true });

        await addTag(
            runtime,
            "caption",
            'msg.reply({ content: "captioned: " + tag.args, file: { data: [137, 80, 78, 71], name: "caption.png" } })',
            "user-1",
            { type: "ivm" }
        );

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("caption this: when the code works", recorder));

        const result = Util.first(bodies[1].body.contents.at(-1).parts).functionResponse.response,
            [file] = recorder.sent.at(-1).files;

        expect(script).toEqual([]);
        expect(result).toMatchObject({ output: "captioned: when the code works", attached: ["caption.png"] });
        expect(file.name).toBe("caption.png");
        expect([...file.attachment]).toEqual([137, 80, 78, 71]);
    });

    test("attaches images it downloads as files", async () => {
        const script = [];
        const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

        await setup(script, {
            routes: { "GET /cat.png": () => ({ headers: { "content-type": "image/png" }, body: png }) }
        });

        script.push(
            calls([call("attach_image", { url: `${server.url}/cat.png`, name: "my cat" })]),
            answer(["Here's the cat."]),
            extras([], [])
        );

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("send me the cat picture", recorder));

        const [file] = recorder.sent.at(-1).files;

        expect(script).toEqual([]);
        expect(file.name).toBe("my_cat.png");
        expect(Buffer.compare(file.attachment, png)).toBe(0);
    });

    test("refreshes expired Discord attachment links before downloading them", async () => {
        const script = [];
        const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

        const bodies = await setup(script, {
            routes: { "GET /fresh.png": () => ({ headers: { "content-type": "image/png" }, body: png }) }
        });

        const expired = "https://cdn.discordapp.com/attachments/1/2/cat.png?ex=00&is=00&hm=00",
            deleted = "https://cdn.discordapp.com/attachments/1/2/gone.png",
            refreshes = [];

        vi.spyOn(runtime.client.client.rest, "post").mockImplementation(async (route, options) => {
            refreshes.push([route, options.body]);

            const urls = options.body.attachment_urls.filter(url => url === expired);
            return { refreshed_urls: urls.map(url => ({ original: url, refreshed: `${server.url}/fresh.png` })) };
        });

        script.push(
            calls([call("attach_image", { url: expired, name: "cat" }), call("attach_image", { url: deleted })]),
            answer(["Here's the cat."]),
            extras([], [])
        );

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("send the old cat picture", recorder));

        const [file] = recorder.sent.at(-1).files;

        expect(refreshes).toEqual([
            ["/attachments/refresh-urls", { attachment_urls: [expired] }],
            ["/attachments/refresh-urls", { attachment_urls: [deleted] }]
        ]);
        expect(Buffer.compare(file.attachment, png)).toBe(0);

        const [, gone] = bodies[1].body.contents.at(-1).parts.map(part => part.functionResponse.response);
        expect(gone).toEqual({ error: "This Discord attachment no longer exists or can't be accessed" });
    });

    test("admins have no time limit when unlimitedTimeForAdmins is on", async () => {
        const script = [answer(["Took a while."]), extras([], [])];

        await setup(script, {
            ai: { timeLimit: 1 },
            auth: { geminiKey: "test-key", owner: askerId }
        });

        const ctx = createAskContext("slow question", createRecorder());
        await getCommand(runtime, "a").handler(ctx);

        expect(script).toEqual([]);
        expect(ctx.timeoutDisabled).toBe(true);
    });

    test("other users still run out of time", async () => {
        await setup([], { ai: { timeLimit: 1 } });

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("slow question", recorder));

        expect(embedOf(recorder.sent.at(-1)).description).toContain("Ran out of time.");
    });

    test("attaches files the model writes and the full answer when it doesn't fit", async () => {
        const longAnswer = "word ".repeat(1000).trim();

        const script = [
            calls([call("attach_file", { name: "script.js", content: "console.log(1);" })]),
            answer([longAnswer]),
            extras([], [])
        ];

        await setup(script);

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("write a script", recorder));

        const final = recorder.sent.at(-1),
            files = final.files.map(file => [file.name, file.attachment.toString()]);

        expect(files).toEqual([
            ["script.js", "console.log(1);"],
            ["answer.md", longAnswer]
        ]);

        expect(embedOf(final).description.length).toBeLessThanOrEqual(4096);
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

    test("finds the main recipe, flags reshaping recipes and shows the recipe card", async () => {
        const itemId = "i:nomilabs:meta_dust:10";

        const recipe = (type, idx, ins) => ({
            type,
            idx,
            eu: 1920,
            dur: 300,
            tier: "EV",
            heat: 0,
            ins,
            outs: "Signalum Dust (4)"
        });

        const searchData = {
            item: { id: itemId, name: "Signalum Dust" },
            machineFilter: null,
            hotChain: false,
            recipes: [
                recipe("Mixer", 0, "Annealed Copper Dust (4), Ardite Dust (2), Red Alloy Dust (2)"),
                recipe("Crafting", 21, "Tiny Pile of Signalum Dust (9)"),
                recipe("Sag Mill", 23, "Signalum Ingot (1)")
            ],
            uses: [],
            alternatives: [{ name: "Signalum Ingot" }]
        };

        const script = [
            calls([call("search_recipes", { query: "signalum dust" })]),
            calls([call("show_recipe", { itemId, idx: 0 })]),
            answer(["Signalum Dust is made in a **Mixer**."]),
            extras([], [])
        ];

        const searches = [],
            shots = [];

        const bodies = await setup(script, {
            routes: {
                "GET /down": () => ({ statusCode: 503, json: {} }),
                "GET /api/search": ({ url }) => {
                    searches.push(Object.fromEntries(url.searchParams));
                    return { json: searchData };
                },
                "GET /api/shot": ({ url }) => {
                    shots.push(Object.fromEntries(url.searchParams));
                    return { json: { ok: true, abs: "https://codex.test/card.png" } };
                }
            }
        });

        await loadSources({
            codex: {
                type: "recipes",
                options: {
                    searchUrls: [`${server.url}/down`, `${server.url}/api/search`],
                    shotUrl: `${server.url}/api/shot`,
                    mode: "normal"
                }
            }
        });

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("how do I make signalum dust", recorder));

        expect(script).toEqual([]);
        expect(searches).toEqual([{ q: "signalum dust", mode: "normal" }]);
        expect(shots).toEqual([{ item: itemId, mode: "normal", r: "1", sel: "card", format: "json", wait: "8" }]);

        const found = bodies[1].body.contents.at(-1).parts[0].functionResponse.response;

        expect(found).not.toHaveProperty("source");
        expect(found.recipes.map(entry => [entry.machine, entry.idx, entry.seconds, entry.fromSameMaterial])).toEqual([
            ["Mixer", 0, 15, false],
            ["Crafting", 21, 15, true],
            ["Sag Mill", 23, 15, true]
        ]);

        const embed = embedOf(recorder.sent.at(-1));

        expect(embed.description).toBe("Signalum Dust is made in a **Mixer**.");
        expect(embed.image.url).toBe("https://codex.test/card.png");
    });

    test("searches the questbook and reads quests with their tasks and prerequisites", async () => {
        const questbook = {
            "questDatabase:9": {
                "0:10": {
                    "questID:3": 1,
                    "preRequisites:11": [0],
                    "properties:10": {
                        "betterquesting:10": { "name:8": "§6Steel Age", "desc:8": "Make §asteel§r in the EBF." }
                    },
                    "tasks:9": {
                        "0:10": {
                            "taskID:8": "bq_standard:retrieval",
                            "requiredItems:9": { "0:10": { "Count:3": 16, "id:8": "gregtech:steel_ingot" } }
                        }
                    }
                },
                "1:10": {
                    "questID:3": 0,
                    "properties:10": { "betterquesting:10": { "name:8": "Iron Age", "desc:8": "Get iron." } }
                }
            },
            "questLines:9": {
                "0:10": {
                    "properties:10": { "betterquesting:10": { "name:8": "The Beginning" } },
                    "quests:9": { "0:10": { "id:3": 1 }, "1:10": { "id:3": 0 } }
                }
            }
        };

        const script = [
            calls([call("search_quests", { query: "steel" })]),
            calls([call("read_quest", { ids: ["1", "9"] })]),
            answer(["Do **Steel Age** next."]),
            extras([], ['Quest "Steel Age"'])
        ];

        const bodies = await setup(script, { routes: { "GET /quests.json": () => ({ json: questbook }) } });

        await loadSources({
            quests: { type: "questbook", options: { urls: { normal: `${server.url}/quests.json` }, mode: "normal" } }
        });

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("what's next after iron?", recorder));

        const responseOf = idx => Util.first(bodies[idx].body.contents.at(-1).parts).functionResponse.response;

        expect(script).toEqual([]);
        expect(responseOf(1).quests.map(quest => [quest.id, quest.title, quest.chapter])).toEqual([
            ["1", "Steel Age", "The Beginning"]
        ]);

        expect(responseOf(2).quests).toEqual([
            {
                source: 'Quest "Steel Age"',
                id: "1",
                title: "Steel Age",
                chapter: "The Beginning",
                text: "Make steel in the EBF.",
                tasks: ["retrieval: 16x gregtech:steel_ingot"],
                prereqs: [{ id: "0", title: "Iron Age" }]
            },
            { id: "9", error: "No quest with this ID." }
        ]);

        expect(embedOf(recorder.sent.at(-1)).description).toContain('Sources:\n1. Quest "Steel Age"');
    });

    test("doesn't offer questbook or recipe tools when no source is enabled", async () => {
        const bodies = await setup([answer(["Hi."]), extras([], [])]);

        await getCommand(runtime, "a").handler(createAskContext("hi", createRecorder()));

        const names = bodies[0].body.tools[0].functionDeclarations.map(decl => decl.name);

        expect(names).not.toContain("search_quests");
        expect(names).not.toContain("search_recipes");
    });

    test("shows an image the model picks in the answer embed", async () => {
        const script = [];

        await setup(script, {
            routes: {
                "HEAD /cat.png": () => ({ headers: { "content-type": "image/png" } }),
                "HEAD /page": () => ({ headers: { "content-type": "text/html" } })
            }
        });

        script.push(
            calls([call("show_image", { url: `${server.url}/cat.png` })]),
            calls([call("show_image", { url: `${server.url}/page` })]),
            answer(["Here it is."]),
            extras([], [])
        );

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("show me a cat", recorder));

        expect(script).toEqual([]);
        expect(embedOf(recorder.sent.at(-1)).image.url).toBe(`${server.url}/cat.png`);
    });
});
