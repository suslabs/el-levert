import { once } from "node:events";

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

const extras = (followUps, sources) => ({ extras: { followUps, sources } });

const trailer = ({ followUps, sources }) =>
    [
        "\n[[EXTRAS]]",
        "Follow-ups:",
        ...followUps.map(item => `- ${item}`),
        "Sources:",
        ...sources.map(item => `- ${item}`)
    ].join("\n");

const withExtras = (res, next) => {
    if (typeof next?.extras === "undefined" || typeof res?.body !== "string") {
        return res;
    }

    return { ...res, body: res.body + `data: ${JSON.stringify(chunk([{ text: trailer(next.extras) }]))}\r\n\r\n` };
};

const triage = (effort, lookup = "", fields = {}) => ({
    json: {
        candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify({ effort, lookup, ...fields }) }] } }],
        ...usage(10)
    }
});

const isTriage = body => typeof body.generationConfig?.responseSchema?.properties?.effort !== "undefined";

async function setup(script, options = {}) {
    const bodies = [],
        triages = [];

    const route = path => ({
        [`POST ${path}`]: ({ body, req }) => {
            const data = JSON.parse(body);

            if (isTriage(data)) {
                triages.push(data);
                return options.triage?.(data) ?? triage("research");
            }

            bodies.push({ path, key: req.headers["x-goog-api-key"], body: data });

            const res = withExtras(script.shift(), Util.first(script));

            if (typeof Util.first(script)?.extras !== "undefined") {
                script.shift();
            }

            return res;
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
                endpoints: { gemini: `${server.url}/v1beta`, openrouter: `${server.url}/api/v1` },
                models: options.models ?? ["test-model"],
                ...options.ai
            }
        },
        auth: options.auth ?? { geminiKey: "test-key" },
        discordOverrides: {
            fetchMember: async (guild, id) => createDiscordMember(createDiscordUser({ id }), { guildId: guild.id }),
            ...options.discordOverrides
        }
    });

    bodies.triages = triages;
    return bodies;
}

async function loadSources(definitions) {
    const { default: AISourceRegistry } = await import("../../../src/ai/sources/AISourceRegistry.js");

    const manager = runtime.client.aiManager;

    manager.sources = new AISourceRegistry(manager.http, manager.requestTimeout);
    await manager.sources.load(definitions);
}

async function loadQuestbooks(configs) {
    const { default: QuestbookManager } = await import("../../../src/managers/misc/QuestbookManager.js");

    runtime.client.questbookManager = new QuestbookManager(true, configs);
    await runtime.client.questbookManager.load();
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

        const command = getCommand(runtime, "ask"),
            recorder = createRecorder(),
            out = await command.handler(createAskContext("", recorder));

        expect(command.name).toBe("ask");
        expect(command.aliases).toContain("a");
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
        expect(bodies.map(entry => entry.path)).toEqual([streamPath("test-model"), streamPath("test-model")]);

        expect(bodies[0].key).toBe("test-key");
        expect(bodies[0].body.toolConfig.functionCallingConfig.mode).toBe("AUTO");
        expect(bodies[0].body.generationConfig.thinkingConfig.thinkingLevel).toBe("low");
        expect(bodies[1].body.systemInstruction).toEqual(bodies[0].body.systemInstruction);
        expect(bodies[0].body.systemInstruction.parts[0].text).toContain(`<@${askerId}>`);
        expect(bodies[0].body.systemInstruction.parts[0].text).toContain("## ANSWER FORMAT");
        expect(bodies[0].body.tools[0].functionDeclarations.map(decl => decl.name)).not.toContain("search_recipes");

        const [search, convert] = bodies[1].body.contents.at(-1).parts.map(part => part.functionResponse);

        expect(search.id).toBe("c1");
        expect(Util.first(search.response.tags)).toMatchObject({ source: "tag:steel", name: "steel" });
        expect(convert.response).toMatchObject({ result: 2.88, output: "2.88 B/s" });

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
            footer: { text: expect.stringMatching(/^Models: test-model \| 1,410 tok, 30 reasoning \| \d+(\.\d)?s$/) }
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

        const body = bodies[1].body,
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

        expect(bodies).toHaveLength(1);
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

        expect(textsOf(bodies[1].body)).toEqual([
            ["user", "hello"],
            ["model", "First answer."],
            ["user", "and then?"]
        ]);

        expect(bodies[1].body.systemInstruction.parts[0].text).not.toContain("The question replies to a message");
        expect(messages.get("q-2-answer").embeds[0].description).toBe("Second answer.");

        const chained = createUserMsg("q-3", "and after that?", replyTo("q-2-answer"));
        await expect(handler.execute(chained)).resolves.toBe(true);

        expect(textsOf(bodies[2].body)).toEqual([
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

    test("runs scripts in the eval sandbox and reads and searches server history the user can access", async () => {
        const fetchCalls = [],
            searchCalls = [];

        const history = [
            createDiscordMessage("recent hello", {
                id: "m-2",
                url: "https://discord.com/channels/guild-1/channel-1/m-2",
                createdAt: new Date(1)
            }),
            createDiscordMessage("unrelated", {
                id: "m-1",
                url: "https://discord.com/channels/guild-1/channel-1/m-1",
                createdAt: new Date(0)
            })
        ];

        const makeChannel = (id, name, allowed) => ({
            id,
            name,
            guildId: "guild-1",
            isTextBased: () => true,
            memberPermissions: () => ({
                has: () => allowed
            })
        });

        const guild = {
            id: "guild-1",
            name: "Test Guild",
            channels: {
                cache: new Map([
                    ["channel-1", makeChannel("channel-1", "general", true)],
                    ["secret-1", makeChannel("secret-1", "mods", false)]
                ])
            }
        };

        const script = [
            calls([
                call("execute_javascript", { code: "const perSec = 144 * 20; perSec" }),
                call("fetch_recent_messages", { limit: 10 }),
                call("search_messages", { query: "ebf" }),
                call("search_messages", { query: ".*", isRegex: true }),
                call("get_asking_user", {})
            ]),
            answer(["2880."]),
            extras([], ["https://discord.com/channels/guild-1/channel-1/3"])
        ];

        const bodies = await setup(script, {
            loadVMs: true,
            discordOverrides: {
                fetchGuild: async () => guild,
                fetchMessages: async (ch_id, options, fetchOptions) => {
                    fetchCalls.push({ ch_id, options, fetchOptions });
                    return new Map(history.map(msg => [msg.id, msg]));
                }
            }
        });

        vi.spyOn(runtime.client.client.rest, "get").mockImplementation(async (route, options) => {
            searchCalls.push({
                route,
                query: Object.fromEntries(options.query.entries()),
                channelIds: options.query.getAll("channel_id")
            });

            return {
                total_results: 1,
                doing_deep_historical_index: false,
                messages: [
                    [
                        {
                            id: "3",
                            channel_id: "channel-1",
                            content: "the ebf is weird",
                            author: { id: "user-2", username: "bob", discriminator: "0", bot: false },
                            attachments: [],
                            embeds: [],
                            mentions: [],
                            mention_roles: [],
                            mention_everyone: false,
                            pinned: false,
                            tts: false,
                            type: 0,
                            timestamp: new Date(1).toISOString()
                        }
                    ]
                ]
            };
        });

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("compute it", recorder));

        const [js, recent, search, matchAll, user] = bodies[1].body.contents
            .at(-1)
            .parts.map(part => part.functionResponse.response);

        expect(js.output).toBe("2880");
        expect(recent.count).toBe(2);
        expect(search.totalResults).toBe(1);
        expect(search.count).toBe(1);
        expect(search.messages[0].content).toBe("the ebf is weird");
        expect(search.messages[0].source).toBe("https://discord.com/channels/guild-1/channel-1/3");
        expect(matchAll.error).toContain("Match-all");
        expect(user).toMatchObject({ id: askerId, roles: ["Member"] });

        expect(fetchCalls[0].options).toEqual({ checkAccess: true, user_id: askerId });
        expect(searchCalls).toEqual([
            {
                route: "/guilds/guild-1/messages/search",
                query: {
                    limit: "10",
                    content: "ebf",
                    channel_id: "channel-1",
                    sort_by: "timestamp",
                    sort_order: "desc",
                    include_nsfw: "false"
                },
                channelIds: ["channel-1"]
            }
        ]);
        expect(embedOf(recorder.sent.at(-1)).description).toBe(
            "2880.\n\nSources:\n1. https://discord.com/channels/guild-1/channel-1/3"
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
            entry.body.toolConfig?.functionCallingConfig.mode ?? null,
            entry.body.generationConfig.thinkingConfig.thinkingLevel
        ];

        expect(modeOf(bodies[0])).toEqual(["AUTO", "low"]);
        expect(modeOf(bodies[1])).toEqual([null, "minimal"]);
        expect(bodies[1].body.tools).toBeUndefined();
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
            streamPath("fallback-model")
        ]);

        expect(bodies[1].body.generationConfig).toBeUndefined();
        expect(bodies[2].body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: "low" });
        expect(embedOf(recorder.sent.at(-1)).footer.text).toMatch(
            /^Models: test-model, fallback-model \| 20 tok \| [\d.]+s$/
        );
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
            streamPath("fallback-model")
        ]);

        const embed = embedOf(recorder.sent.at(-1));

        expect(embed.description).toBe("1 B is 1000 mB.");
        expect(embed.footer.text).toMatch(/^Models: test-model, fallback-model \| 40 tok \| [\d.]+s$/);
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
            streamPath("third-model")
        ]);

        const progress = recorder.sent.slice(0, -1).map(payload => embedOf(payload).description);
        expect(progress.at(-1)).not.toContain("Half an");

        const embed = embedOf(recorder.sent.at(-1));

        expect(embed.description).toBe("A complete answer.");
        expect(embed.footer.text).toMatch(/^Models: test-model, third-model \| /);
    });

    test("skips usage-limited and overloaded models on the next question", async () => {
        let limitedHits = 0,
            overloadedHits = 0;

        const limited = () => {
            limitedHits++;

            return {
                statusCode: 429,
                json: {
                    error: {
                        message: "Quota exceeded.",
                        details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "60s" }]
                    }
                }
            };
        };

        const overloaded = () => {
            overloadedHits++;
            return sse(chunk([{ text: "An interrupted answer" }]), { error: { code: 503, message: "High demand." } });
        };

        await setup([answer(["First."]), answer(["Second."])], {
            models: ["test-model", "busy-model", "fallback-model"],
            ai: {
                modelCooldown: Util.durationSeconds.minute / Util.durationSeconds.milli,
                maxModelCooldown: (10 * Util.durationSeconds.minute) / Util.durationSeconds.milli
            },
            routes: {
                [`POST ${streamPath("test-model")}`]: limited,
                [`POST ${streamPath("busy-model")}`]: overloaded
            }
        });

        await getCommand(runtime, "a").handler(createAskContext("first", createRecorder()));

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("second", recorder));

        expect(limitedHits).toBe(1);
        expect(overloadedHits).toBe(1);
        expect(embedOf(recorder.sent.at(-1)).description).toBe("Second.");
    });

    test("skips an overloaded key and a rejected key and keeps the overload retry time", async () => {
        const script = [
            { statusCode: 503, headers: { "retry-after": "45" }, json: { error: { message: "High demand." } } },
            { statusCode: 401, json: { error: { message: "Invalid key." } } }
        ];
        const bodies = await setup(script, { auth: { geminiKey: ["key-1", "key-2"] } });

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("first", createRecorder()));
        await getCommand(runtime, "a").handler(createAskContext("second", recorder));

        expect(bodies.map(entry => entry.key)).toEqual(["key-1", "key-2"]);
        expect(bodies.triages).toHaveLength(1);
        expect(embedOf(recorder.sent.at(-1)).description).toMatch(/overloaded right now\. Try again in \*\*4\ds\*\*/);
    });

    test("says when to try again once every model is usage-limited", async () => {
        const limited = {
            statusCode: 429,
            json: {
                error: {
                    message: "Quota exceeded.",
                    details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "45s" }]
                }
            }
        };

        await setup([limited]);

        await getCommand(runtime, "a").handler(createAskContext("first", createRecorder()));

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("second", recorder));

        const description = embedOf(recorder.sent.at(-1)).description;

        expect(description).toContain("All models are unavailable right now.");
        expect(description).toMatch(/The AI usage limits are used up for now\. Try again in \*\*4\ds\*\*\./);
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
        expect(description).toContain("The AI models are overloaded right now");
        expect(description).not.toContain("high demand");
    });

    test("redacts credentials echoed in a provider error", async () => {
        await setup([{ statusCode: 400, json: { error: { message: "Invalid request using test-key" } } }]);

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("hi", recorder));

        const description = embedOf(recorder.sent.at(-1)).description;
        expect(description).toContain("Invalid request using [redacted]");
        expect(description).not.toContain("test-key");
    });

    test("falls back to an OpenRouter model that can call tools", async () => {
        const chat = (...events) => ({
            headers: { "content-type": "text/event-stream" },
            body: [...events.map(event => `data: ${JSON.stringify(event)}\n\n`), "data: [DONE]\n\n"].join("")
        });

        const replies = [
            chat(
                {
                    choices: [
                        {
                            delta: {
                                tool_calls: [
                                    {
                                        index: 0,
                                        id: "or1",
                                        function: {
                                            name: "unit_convert",
                                            arguments: '{"value":1,"from":"B","to":"mB"}'
                                        }
                                    }
                                ]
                            }
                        }
                    ]
                },
                { choices: [{ delta: {}, finish_reason: "tool_calls" }], usage: { total_tokens: 30 } }
            ),
            chat(
                { choices: [{ delta: { content: "1 B is **1000 mB**." } }] },
                { choices: [{ delta: { content: "\n[[EXTRAS]]\nFollow-ups:\n- what about 2 B\nSources:" } }] },
                { choices: [{ delta: {}, finish_reason: "stop" }], usage: { total_tokens: 40 } }
            )
        ];

        const requests = [];

        await setup([{ statusCode: 503, json: { error: { message: "High demand." } } }], {
            ai: { models: ["test-model", "openrouter:vendor/model:free"] },
            auth: { geminiKey: "test-key", openrouterKey: "sk-or-test" },
            routes: {
                "POST /api/v1/chat/completions": ({ body, req }) => {
                    requests.push({ auth: req.headers.authorization, body: JSON.parse(body) });
                    return replies.shift();
                }
            }
        });

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("1 bucket in mB?", recorder));

        expect(replies).toEqual([]);
        expect(requests.map(request => [request.auth, request.body.model])).toEqual([
            ["Bearer sk-or-test", "vendor/model:free"],
            ["Bearer sk-or-test", "vendor/model:free"]
        ]);

        const toolMessage = requests[1].body.messages.find(message => message.role === "tool");
        expect(toolMessage.tool_call_id).toBe("or1");
        expect(JSON.parse(toolMessage.content)).toMatchObject({ result: 1000 });

        const final = recorder.sent.at(-1);

        expect(embedOf(final).description).toContain("1 B is **1000 mB**.");
        expect(embedOf(final).footer.text).toMatch(/^Models: test-model, openrouter:vendor\/model:free \| 80 tok \| /);
        expect(buttonsOf(final).map(button => button.label)).toEqual(["1"]);
    });

    test("tries the same model on the next key before moving to the next model", async () => {
        const overloaded = { statusCode: 503, json: { error: { message: "High demand." } } },
            cut = sse(chunk([{ text: "Half" }]), { error: { code: 503, message: "Overloaded." } });

        const script = [overloaded, cut, overloaded, answer(["Done."])];

        const bodies = await setup(script, {
            models: ["test-model", "fallback-model"],
            ai: { models: ["test-model", "fallback-model"] },
            auth: { geminiKey: ["key-a", "key-b"] }
        });

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("hi", recorder));

        expect(script).toEqual([]);
        expect(bodies.map(entry => [entry.path, entry.key])).toEqual([
            [streamPath("test-model"), "key-a"],
            [streamPath("test-model"), "key-b"],
            [streamPath("fallback-model"), "key-a"],
            [streamPath("fallback-model"), "key-b"]
        ]);
        expect(embedOf(recorder.sent.at(-1)).description).toBe("Done.");
    });

    test("skips a rejected key until restart and answers with the next one", async () => {
        const rejected = {
            statusCode: 401,
            json: { error: { message: "The bound service account is deleted or disabled.", status: "UNAUTHENTICATED" } }
        };

        const script = [rejected, answer(["ok"]), answer(["again"])];

        const bodies = await setup(script, { auth: { geminiKey: ["key-1", "key-2"] } });

        const recorder = createRecorder();

        await getCommand(runtime, "a").handler(createAskContext("hi", recorder));
        await getCommand(runtime, "a").handler(createAskContext("hi again", createRecorder()));

        expect(script).toEqual([]);
        expect(bodies.map(entry => entry.key)).toEqual(["key-1", "key-2", "key-2"]);
        expect(embedOf(recorder.sent.at(-1)).description).toBe("ok");
    });

    test("runs the overclock calculator as a tool", async () => {
        const script = [
            calls([
                call("overclock", { eu: 1920, duration: "60s", mode: "ebf", recipeHeat: 3600, coilHeat: 5200 }),
                call("overclock", { eu: -5, duration: "1s" })
            ]),
            answer(["Done."])
        ];

        const bodies = await setup(script);
        await getCommand(runtime, "a").handler(createAskContext("oc 1920 eu 60s in the ebf", createRecorder()));

        const [ebf, invalid] = bodies[1].body.contents.at(-1).parts.map(part => part.functionResponse.response);

        expect(script).toEqual([]);
        expect(ebf).toMatchObject({ input: "1,920 EU/t for 60s", mode: "ebf" });
        expect(ebf.table).toContain("EU/t");
        expect(ebf.table).toContain("EV");
        expect(ebf.notes).toContain("Applicable for NFu");
        expect(invalid.error).toContain("EU cost must be positive");
    });

    test("tries keys in order and skips a key until Google says its quota is back", async () => {
        const limited = {
            statusCode: 429,
            json: {
                error: {
                    message: "Resource exhausted.",
                    details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "60s" }]
                }
            }
        };

        const script = [limited, answer(["ok"]), extras([], []), answer(["again"]), extras([], [])];

        const bodies = await setup(script, { auth: { geminiKey: ["key-1", "key-1", "key-2"] } });

        await getCommand(runtime, "a").handler(createAskContext("hi", createRecorder()));
        await getCommand(runtime, "a").handler(createAskContext("hi again", createRecorder()));

        expect(script).toEqual([]);
        expect(bodies.map(entry => entry.key)).toEqual(["key-1", "key-2", "key-2"]);
    });

    test("limits how often each user can ask", async () => {
        const bodies = await setup([answer(["ok"]), extras([], [])], {
            ai: { maxRequests: 1, rateLimitWindow: 60 * 1000 }
        });

        await getCommand(runtime, "a").handler(createAskContext("hi", createRecorder()));

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("hi again", recorder));

        expect(bodies).toHaveLength(1);
        expect(recorder.sent).toHaveLength(1);
        expect(recorder.sent[0]).toMatch(/You are asking too fast\. Please slow down! \(\*\*\d+s\*\*\)/);
    });

    test("posts the answer without buttons when it has no follow-ups block", async () => {
        await setup([answer(["The answer."])]);

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("hi", recorder));

        const final = recorder.sent.at(-1);

        expect(embedOf(final).description).toBe("The answer.");
        expect(final.components).toEqual([]);
    });

    test("skips a model that takes too long and answers with the next one", async () => {
        const slow = () => new Promise(resolve => setTimeout(() => resolve(answer(["late"])), 1500));

        await setup([answer(["From the fallback."]), extras([], [])], {
            ai: { requestTimeout: 100, models: ["test-model", "fallback-model"] },
            models: ["test-model", "fallback-model"],
            routes: { [`POST ${streamPath("test-model")}`]: slow }
        });

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("hi", recorder));

        const embed = embedOf(recorder.sent.at(-1));

        expect(embed.description).toBe("From the fallback.");
        expect(embed.footer.text).toMatch(/^Models: test-model, fallback-model \| /);
    });

    test("reports every model being too slow as an error instead of crashing", async () => {
        const slow = () => new Promise(resolve => setTimeout(() => resolve(answer(["late"])), 1500));

        await setup([], {
            ai: { requestTimeout: 100 },
            routes: { [`POST ${streamPath("test-model")}`]: slow }
        });

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("hi", recorder));

        const embed = embedOf(recorder.sent.at(-1));

        expect(embed.color).toBe(0xed4245);
        expect(embed.description).toContain("All models are unavailable right now.");
    });

    test("abandons a stalled response body and falls back without keeping its partial text", async () => {
        const partial = sse(chunk([{ text: "Stalled partial answer." }]));

        const bodies = await setup([answer(["From the fallback."])], {
            ai: { requestTimeout: 1 / Util.durationSeconds.milli },
            models: ["test-model", "fallback-model"],
            routes: {
                [`POST ${streamPath("test-model")}`]: async ({ res }) => {
                    res.writeHead(200, partial.headers);
                    res.write(partial.body);
                    await once(res, "close");
                }
            }
        });

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("hi", recorder));

        expect(bodies.map(entry => entry.path)).toEqual([streamPath("fallback-model")]);
        expect(embedOf(recorder.sent.at(-1)).description).toBe("From the fallback.");
    });

    test("falls back when Gemini reports depleted credits", async () => {
        const bodies = await setup(
            [
                { statusCode: 402, json: { error: { message: "Insufficient credits." } } },
                answer(["From the fallback."])
            ],
            { models: ["test-model", "fallback-model"] }
        );

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("hi", recorder));

        expect(bodies.map(entry => entry.path)).toEqual([streamPath("test-model"), streamPath("fallback-model")]);
        expect(embedOf(recorder.sent.at(-1)).description).toBe("From the fallback.");
    });

    test("keeps an active stream going across the idle timeout interval", async () => {
        const partial = sse(chunk([{ text: "One " }]));

        await setup([], {
            ai: { requestTimeout: 0.5 / Util.durationSeconds.milli },
            routes: {
                [`POST ${streamPath("test-model")}`]: async ({ res }) => {
                    res.writeHead(200, partial.headers);
                    res.write(partial.body);

                    for (const piece of ["two ", "three."]) {
                        await Util.delay(0.25 / Util.durationSeconds.milli);
                        res.write(sse(chunk([{ text: piece }])).body);
                    }

                    await Util.delay(0.25 / Util.durationSeconds.milli);
                    return sse(chunk([], { finishReason: "STOP" })).body;
                }
            }
        });

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("hi", recorder));

        expect(embedOf(recorder.sent.at(-1)).description).toBe("One two three.");
    });

    test("answers quick questions briefly with a smaller step budget", async () => {
        const script = [
            calls([call("find_users", { query: "sloppa" })]),
            answer(["**Sloppa** is a member here."]),
            extras(["Who else is in the server?"], [])
        ];

        const bodies = await setup(script, { triage: () => triage("quick") });

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("who is sloppa", recorder));

        expect(script).toEqual([]);
        expect(bodies.triages).toHaveLength(1);
        expect(bodies.triages[0].contents.at(-1).parts[0].text).toBe("who is sloppa");

        const [lookup, final] = bodies.map(entry => entry.body);

        expect(lookup.systemInstruction.parts[0].text).toContain("- Effort: quick");
        expect(lookup.toolConfig.functionCallingConfig.mode).toBe("AUTO");
        expect(final.tools).toBeUndefined();

        expect(embedOf(recorder.sent.at(-1)).description).toContain("**Sloppa** is a member here.");
    });

    test("ignores tool calls the model makes on its last step", async () => {
        const script = [
            calls([call("find_users", { query: "pexa" })]),
            sse(chunk([{ text: "No member called **pexa** here." }, call("search_wikipedia", { query: "pexa" })]), {
                ...chunk([], { finishReason: "STOP" }),
                ...usage(10)
            }),
            extras([], [])
        ];

        const bodies = await setup(script, { triage: () => triage("quick") });

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("who is pexa", recorder));

        expect(script).toEqual([]);
        expect(bodies[1].body.tools).toBeUndefined();
        expect(bodies[1].body.contents.at(-1).parts.at(-1).text).toContain("Tools are no longer available.");
        expect(embedOf(recorder.sent.at(-1)).description).toContain("No member called **pexa** here.");
    });

    test("looks up who/what questions on Wikipedia and the web before the model answers", async () => {
        const lookups = { wiki: [], read: [], web: [] };

        const script = [
            calls([call("search_wikipedia", { query: " Tung Tung TUNG  shaur" })]),
            answer(["**Tung Tung Tung Sahur** is an AI-generated meme character."])
        ];

        const bodies = await setup(script, { triage: () => triage("research", "tung tung tung shaur") });

        const manager = runtime.client.aiManager;

        manager.sources.sources.set("wiki", {
            name: "Wikipedia",
            search: async query => {
                lookups.wiki.push(query);
                return [{ title: "Tung Tung Tung Sahur", url: "https://en.wikipedia.org/wiki/Tung", snippet: "" }];
            },
            read: async title => {
                lookups.read.push(title);
                return { title, url: "https://en.wikipedia.org/wiki/Tung", text: "An Italian brainrot meme." };
            },
            getLanguage: language => language ?? "en"
        });

        manager.webSearcher = {
            search: async query => {
                lookups.web.push(query);
                return { query, results: [{ title: "Tung Tung Tung Sahur meme", url: "https://example.test/tung" }] };
            }
        };

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("who is tung tung tung shaur", recorder));

        expect(script).toEqual([]);
        expect(lookups).toEqual({
            wiki: ["tung tung tung shaur"],
            read: ["Tung Tung Tung Sahur"],
            web: ["tung tung tung shaur"]
        });

        const question = Util.first(bodies).body.contents.at(-1);

        expect(question.parts[0].text).toBe("who is tung tung tung shaur");
        expect(question.parts[1].text).toContain("Automatic lookup");
        expect(question.parts[1].text).toContain("An Italian brainrot meme.");
        expect(question.parts[1].text).toContain("https://example.test/tung");

        const repeated = bodies[1].body.contents.at(-1).parts[0].functionResponse.response;
        expect(repeated).toMatchObject({ repeated: true });

        expect(embedOf(recorder.sent.at(-1)).description).toContain("Tung Tung Tung Sahur");
    }, 30000);

    test("tells the model not to guess once every search came back empty or failed", async () => {
        const script = [
            calls([call("search_web", { query: "who created nomifactory" })]),
            answer(["I couldn't find who created Nomifactory."])
        ];

        const bodies = await setup(script);

        runtime.client.aiManager.webSearcher = {
            search: async query => ({ query, results: [] })
        };

        await getCommand(runtime, "a").handler(createAskContext("who created nomifactory", createRecorder()));

        const notes = request =>
            request.body.contents
                .at(-1)
                .parts.map(part => part.text ?? "")
                .join("\n");

        expect(script).toEqual([]);
        expect(notes(Util.first(bodies))).not.toContain("Don't answer from memory");
        expect(notes(bodies[1])).toContain("Don't answer from memory");
    });

    test("doesn't look anything up when triage finds no outside subject", async () => {
        const searches = [];

        const script = [answer(["Steel is made in the **EBF**."])];
        const bodies = await setup(script, { triage: () => triage("research", "") });

        runtime.client.aiManager.webSearcher = {
            search: async query => {
                searches.push(query);
                return { query, results: [] };
            }
        };

        await getCommand(runtime, "a").handler(
            createAskContext("what is steel used for in nomifactory", createRecorder())
        );

        expect(script).toEqual([]);
        expect(searches).toEqual([]);

        const parts = Util.first(bodies).body.contents.at(-1).parts;
        expect(Util.first(parts).text).toBe("what is steel used for in nomifactory");
        expect(parts.some(part => part.text?.includes("Automatic lookup"))).toBe(false);
    });

    test("treats a question as research when triage fails", async () => {
        const script = [answer(["Thorough answer."]), extras([], [])];

        const bodies = await setup(script, { triage: () => ({ json: { candidates: [] } }) });

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("how do I make steel", recorder));

        expect(bodies[0].body.systemInstruction.parts[0].text).toContain("- Effort: research");
        expect(bodies[0].body.toolConfig.functionCallingConfig.mode).toBe("AUTO");
        expect(embedOf(recorder.sent.at(-1)).description).toBe("Thorough answer.");
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

    test("refreshes expired media/proxy attachment URLs in inspect_image, show_image, history, and tags", async () => {
        const script = [];
        const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

        const mediaUrl =
                "https://media.discordapp.net/attachments/1/2/pic.png?ex=00&is=00&hm=00&format=webp&width=640&",
            tagOldUrl = "https://cdn.discordapp.com/attachments/1/2/tag.png?ex=00&is=00&hm=00",
            histOldUrl = "https://cdn.discordapp.com/attachments/1/2/hist.png?ex=00&is=00&hm=00",
            refreshes = [];

        const bodies = await setup(script, {
            routes: {
                "GET /pic-fresh.png": () => ({ headers: { "content-type": "image/png" }, body: png }),
                "HEAD /pic-fresh.png": () => ({ headers: { "content-type": "image/png" } })
            },
            discordOverrides: {
                fetchMessages: async () =>
                    new Map([
                        [
                            "m-1",
                            createDiscordMessage(`see ${histOldUrl}`, {
                                id: "m-1",
                                url: "https://discord.com/channels/guild-1/channel-1/m-1",
                                createdAt: new Date(1)
                            })
                        ]
                    ])
            }
        });

        await addTag(runtime, "imgtag", `cached image: ${tagOldUrl}`);

        const canonicalMedia = "https://cdn.discordapp.com/attachments/1/2/pic.png?ex=00&is=00&hm=00";

        vi.spyOn(runtime.client.client.rest, "post").mockImplementation(async (route, options) => {
            refreshes.push(options.body.attachment_urls);

            return {
                refreshed_urls: options.body.attachment_urls
                    .filter(url => url === canonicalMedia || url === tagOldUrl || url === histOldUrl)
                    .map(url => ({
                        original: url,
                        refreshed:
                            url === canonicalMedia
                                ? `${server.url}/pic-fresh.png`
                                : `${url.split("?")[0]}?ex=ffffff&is=01&hm=99`
                    }))
            };
        });

        script.push(
            calls([
                call("tag_get", { name: "imgtag" }),
                call("fetch_recent_messages", { limit: 5 }),
                call("inspect_image", { url: mediaUrl, prompt: "describe" }),
                call("show_image", { url: mediaUrl })
            ]),
            {
                json: {
                    candidates: [{ content: { role: "model", parts: [{ text: "It is a test icon." }] } }],
                    ...usage(10)
                }
            },
            answer(["Done."]),
            extras([], [])
        );

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("check these images", recorder));

        const [tagRes, histRes, inspectRes, showRes] = bodies[2].body.contents
            .at(-1)
            .parts.map(part => part.functionResponse.response);

        expect(bodies[1].body.contents[0].parts[0].inlineData).toMatchObject({ mimeType: "image/png" });
        expect(tagRes.body).toBe(
            "cached image: https://cdn.discordapp.com/attachments/1/2/tag.png?ex=ffffff&is=01&hm=99"
        );
        expect(histRes.messages[0].content).toBe(
            "see https://cdn.discordapp.com/attachments/1/2/hist.png?ex=ffffff&is=01&hm=99"
        );
        expect(inspectRes.description).toBe("It is a test icon.");
        expect(showRes).toEqual({ shown: true });
        expect(embedOf(recorder.sent.at(-1)).image.url).toBe(`${server.url}/pic-fresh.png`);
        expect(refreshes.flat()).toContain(canonicalMedia);
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
            sse({ ...chunk([], { finishReason: "SAFETY" }), ...usage(5) }),
            { statusCode: 401, json: { error: { message: "Bad key", status: "UNAUTHENTICATED" } } }
        ];

        await setup(script);

        const results = [];

        for (let i = 0; i < 3; i++) {
            const recorder = createRecorder();
            await getCommand(runtime, "a").handler(createAskContext("hi", recorder));

            results.push(embedOf(recorder.sent.at(-1)));
        }

        expect(results.map(embed => embed.color)).toEqual([0xed4245, 0xed4245, 0xed4245]);
        expect(results[0].description).toContain("usage limits are used up");
        expect(results[1].description).toContain("The model returned no answer (SAFETY)");
        expect(results[2].description).toContain("The bot's AI API key was rejected.");
    });

    test("searches normal mode when asked even after the conversation switched to expert", async () => {
        const searches = [];

        const script = [
            calls([
                call("search_recipes", { query: "liquid ender air", expert: false }),
                call("search_recipes", { query: "liquid ender air", expert: true })
            ]),
            answer(["Same recipe in both modes."])
        ];

        await setup(script, {
            routes: {
                "GET /api/search": ({ url }) => {
                    searches.push(url.searchParams.get("mode"));
                    return { json: { error: "not found", alternatives: [] } };
                }
            }
        });

        await loadSources({
            codex: {
                type: "recipes",
                options: { searchUrls: [`${server.url}/api/search`], shotUrl: "x", mode: "normal" }
            }
        });

        const history = [
            { role: "user", text: "make the stabilized miner" },
            { role: "model", text: "It's expert only.", expert: true }
        ];

        const ctx = createAskContext("does it differ in normal mode?", createRecorder()),
            request = {
                author: ctx.author,
                member: null,
                channel: ctx.channel,
                guild: null,
                msg: null,
                replyMsg: null
            };

        await runtime.client.aiManager.ask(
            "does it differ in normal mode?",
            { ...request, scriptValues: {} },
            { history }
        );

        expect(script).toEqual([]);
        expect(searches).toEqual(["normal", "expert"]);
    });

    test("answers repeated calls from memory and caps how often a search tool runs", async () => {
        const searches = [];

        const search = query => call("search_recipes", { query });

        const script = [
            calls([search("a"), search("a")]),
            calls([search("b"), search("c"), search("d"), search("e")]),
            answer(["Done."])
        ];

        const bodies = await setup(script, {
            routes: {
                "GET /api/search": ({ url }) => {
                    searches.push(url.searchParams.get("q"));
                    return { json: { error: "not found", alternatives: [] } };
                }
            }
        });

        await loadSources({
            codex: {
                type: "recipes",
                options: { searchUrls: [`${server.url}/api/search`], shotUrl: "x", mode: "normal" }
            }
        });

        await getCommand(runtime, "a").handler(createAskContext("loop please", createRecorder()));

        const responses = idx =>
            bodies[idx].body.contents
                .at(-1)
                .parts.filter(part => typeof part.functionResponse !== "undefined")
                .map(part => part.functionResponse.response);

        expect(script).toEqual([]);
        expect(responses(1)[1]).toMatchObject({ repeated: true });
        expect(responses(2).at(-1).error).toContain("as many times as allowed");
        expect(new Set(searches.filter(query => query !== null))).toEqual(new Set(["a", "b", "c", "d"]));
    });

    test("passes ranked hot ingot steps through with the card item they belong to", async () => {
        const hotId = "i:hot_signalum_ingot";

        const recipe = (type, role, idx, ins, outs, extra = {}) => ({
            type,
            role,
            idx,
            eu: 7680,
            dur: 938,
            tier: "IV",
            heat: 0,
            ins,
            outs,
            variants: [],
            ...extra
        });

        const searchData = {
            item: { id: "i:signalum_ingot", name: "Signalum Ingot" },
            machineFilter: null,
            uses: [],
            alternatives: [],
            recipes: [
                recipe("Blast Furnace", "hot", 0, "Signalum Dust (1), Helium (100L)", "Hot Signalum Ingot (1)", {
                    heat: 4000,
                    itemId: hotId,
                    itemName: "Hot Signalum Ingot"
                }),
                recipe("Vacuum Freezer", "cool", 3, "Hot Signalum Ingot (1)", "Signalum Ingot (1)"),
                recipe("Crafting", "reshape", 1, "Block of Signalum (1)", "Signalum Ingot (9)", {
                    variants: [{ type: "Crafting", ins: "Signalum Nugget (9)" }]
                })
            ]
        };

        const script = [
            calls([call("search_recipes", { query: "Signalum Ingot", machine: "EBF" })]),
            calls([call("show_recipe", { itemId: hotId, idx: 0 })]),
            answer(["Blast it, then cool it."])
        ];

        const queries = [],
            shots = [];

        const bodies = await setup(script, {
            routes: {
                "GET /api/search": ({ url }) => {
                    queries.push(url.searchParams.get("q"));
                    return { json: searchData };
                },
                "GET /api/shot": ({ url }) => {
                    shots.push(url.searchParams.get("item"));
                    return { json: { ok: true, abs: "https://codex.test/card.png" } };
                }
            }
        });

        await loadSources({
            codex: {
                type: "recipes",
                options: { searchUrls: [`${server.url}/api/search`], shotUrl: `${server.url}/api/shot`, mode: "normal" }
            }
        });

        await getCommand(runtime, "a").handler(createAskContext("signalum ebf recipe", createRecorder()));

        const found = bodies[1].body.contents.at(-1).parts[0].functionResponse.response;

        expect(script).toEqual([]);
        expect(queries).toEqual(["Signalum Ingot"]);
        expect(shots).toEqual([hotId]);

        expect(found.machines).toEqual({ "Blast Furnace": 1, "Vacuum Freezer": 1, Crafting: 1 });
        expect(found.recipes).toEqual([
            {
                itemId: hotId,
                idx: 0,
                role: "hot",
                machine: "Blast Furnace",
                euPerTick: 7680,
                seconds: 46.9,
                tier: "IV",
                heat: 4000,
                cleanroom: false,
                inputs: "Signalum Dust (1), Helium (100L)",
                outputs: "Hot Signalum Ingot (1)"
            }
        ]);
        expect(found).not.toHaveProperty("note");
    });

    test("asks for exact names when pack data only returns fuzzy matches for recipe targets", async () => {
        const queries = [];
        const bodies = await setup([], {
            triage: () =>
                triage("research", "", {
                    recipeQueries: [
                        { query: "pex", uses: false },
                        { query: "lex", uses: true }
                    ]
                }),
            routes: {
                "GET /api/search": ({ url }) => {
                    const query = url.searchParams.get("q");
                    queries.push([query, url.searchParams.get("uses")]);
                    const name = query === "pex" ? "Polyethylene" : "Lexan";
                    return { json: { item: { id: `test:${name}`, name }, alternatives: [] } };
                }
            }
        });
        await loadSources({
            codex: { type: "recipes", options: { searchUrls: [`${server.url}/api/search`], mode: "normal" } }
        });

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("how do i craft pex and crack lex", recorder));

        expect(queries).toEqual(
            expect.arrayContaining([
                ["pex", null],
                ["lex", "1"]
            ])
        );
        expect(bodies).toHaveLength(0);
        expect(embedOf(recorder.sent.at(-1)).description).toContain("exact item names or IDs shown in JEI");
    });

    test.each([
        ["draconium", "What is the best way to make draconium? Do extensive research.", false],
        ["molten draconium", "What is the best way to make molten draconium?", true]
    ])("checks the requested form for %s before answering", async (query, question, isFluid) => {
        const queries = [];
        const bodies = await setup(isFluid ? [answer(["NomiCodex lists extracting Draconium Rods into fluid."])] : [], {
            triage: () => triage("research", "", { recipeQueries: [{ query, uses: false }] }),
            routes: {
                "GET /api/search": ({ url }) => {
                    const q = url.searchParams.get("q");
                    queries.push(q);

                    if (q === "molten draconium") {
                        return { json: { item: { id: "f:gregtech:uranium", name: "Molten Uranium" } } };
                    }

                    return {
                        json: {
                            item: { id: "f:nomilabs:draconium", name: "Draconium" },
                            alternatives: [
                                { name: "Draconium Dust" },
                                { name: "Draconium Ingot" },
                                { name: "Draconium Plate" }
                            ],
                            recipes: [
                                {
                                    idx: 1,
                                    type: "Extractor",
                                    role: "recycle",
                                    eu: 480,
                                    dur: 206,
                                    ins: "Draconium Rod (1)",
                                    outs: "Draconium (72L)"
                                }
                            ]
                        }
                    };
                }
            }
        });
        await loadSources({ codex: { type: "recipes", options: { searchUrls: [`${server.url}/api/search`] } } });

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext(question, recorder));

        const description = embedOf(recorder.sent.at(-1)).description;

        if (isFluid) {
            expect(queries).toEqual(["molten draconium", "draconium"]);
            const lookup = Util.first(bodies)
                .body.contents.at(-1)
                .parts.find(part => part.text.startsWith("Pack recipe lookups"));
            expect(JSON.parse(lookup.text.split("\n")[1])).toMatchObject({
                missing: [],
                results: [
                    { item: { id: "f:nomilabs:draconium" }, recipes: [{ role: "recycle", machine: "Extractor" }] }
                ]
            });
            expect(description).toContain("extracting Draconium Rods into fluid");
        } else {
            expect(queries).toEqual(["draconium"]);
            expect(bodies).toHaveLength(0);
            expect(description).toContain("Which form do you want to look up?");
            expect(description).toContain("**Draconium Dust**, **Draconium Ingot**, **Draconium (fluid)**");
        }
    });

    test("verifies recipe targets while honoring a no-web restriction", async () => {
        const bodies = await setup(
            [answer(["The pack lists a steel recipe. What exact name does JEI show for pex?"])],
            {
                triage: () =>
                    triage("research", "", {
                        excludedTools: ["search_web"],
                        recipeQueries: [
                            { query: "steel", uses: false, expert: true },
                            { query: "pex", uses: false }
                        ]
                    }),
                routes: {
                    "GET /api/search": ({ url }) => {
                        if (url.searchParams.get("q") === "pex") {
                            return { json: { error: "not found" } };
                        }

                        return {
                            json: {
                                item: { id: "test:steel", name: "Steel Ingot" },
                                alternatives: [],
                                recipes: [
                                    {
                                        type: "Blast Furnace",
                                        idx: 0,
                                        eu: 30,
                                        dur: 20,
                                        ins: "Steel Dust",
                                        outs: "Steel Ingot"
                                    }
                                ]
                            }
                        };
                    }
                }
            }
        );
        await loadSources({
            codex: { type: "recipes", options: { searchUrls: [`${server.url}/api/search`], mode: "normal" } }
        });

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(
            createAskContext("how do i craft steel and pex in expert? no web search", recorder)
        );

        const lookup = bodies[0].body.contents.at(-1).parts.find(part => part.text.startsWith("Pack recipe lookups"));
        expect(bodies[0].body.tools[0].functionDeclarations.some(tool => tool.name === "search_web")).toBe(false);
        expect(JSON.parse(lookup.text.split("\n")[1])).toMatchObject({
            missing: ["pex"],
            results: [
                { mode: "expert", item: { name: "Steel Ingot" }, recipes: [{ inputs: "Steel Dust" }] },
                { found: false }
            ]
        });
        expect(embedOf(recorder.sent.at(-1)).description).toContain("What exact name does JEI show for pex?");
    });

    test("searches the item alone and filters its recipes by machine type", async () => {
        const recipe = (type, outs) => ({ type, idx: 0, eu: 30, dur: 20, tier: "LV", heat: 0, ins: "Air", outs });

        const data = {
            item: { id: "f:liquid_ender_air", name: "Liquid Ender Air" },
            machineFilter: null,
            recipes: [recipe("Vacuum Freezer", "Liquid Ender Air (1000L)")],
            uses: [
                {
                    n: "Enderpearl Dust",
                    t: "Distillation Tower",
                    e: 7680,
                    d: 2000,
                    x: "IV",
                    h: 0,
                    a: 1,
                    i: "Liquid Ender Air"
                }
            ],
            alternatives: []
        };

        const script = [
            calls([
                call("search_recipes", { query: "Liquid Ender Air", machine: "distillation", uses: true }),
                call("search_recipes", { query: "Liquid Ender Air", machine: "EBF" })
            ]),
            answer(["It's distilled in the **Distillation Tower**."])
        ];

        const queries = [];

        const bodies = await setup(script, {
            triage: () =>
                triage("research", "", {
                    toolScope: "only",
                    requiredTools: ["search_recipes"],
                    allowedTools: ["search_recipes", "show_recipe"]
                }),
            routes: {
                "GET /api/search": ({ url }) => {
                    queries.push(url.searchParams.get("q"));
                    return { json: data };
                }
            }
        });

        await loadSources({
            codex: {
                type: "recipes",
                options: { searchUrls: [`${server.url}/api/search`], shotUrl: "x", mode: "normal" }
            }
        });

        await getCommand(runtime, "a").handler(
            createAskContext(
                "Use only %rp to check Liquid Ender Air in the Distillation Tower and the EBF.",
                createRecorder()
            )
        );

        const classifier = Util.first(bodies.triages).systemInstruction.parts,
            instructions = Util.first(bodies).body.systemInstruction.parts;

        expect(Util.first(classifier).text).toContain(
            "rp, %rp, recipe browser, recipe data: search_recipes and show_recipe"
        );
        expect(Util.first(instructions).text).toContain("`rp` is the built-in Discord recipe command");
        expect(
            Util.first(bodies)
                .body.tools[0].functionDeclarations.map(tool => tool.name)
                .sort()
        ).toEqual(["search_recipes", "show_recipe"]);

        const [uses, ebf] = bodies[1].body.contents
            .at(-1)
            .parts.filter(part => typeof part.functionResponse !== "undefined")
            .map(part => part.functionResponse.response);

        expect(script).toEqual([]);
        expect(queries).toEqual(["Liquid Ender Air", "Liquid Ender Air"]);

        expect(uses).toMatchObject({ machine: "distillation", machines: { "Distillation Tower": 1 }, totalUses: 1 });
        expect(uses.note).toBeUndefined();

        expect(ebf).toMatchObject({ machines: { "Vacuum Freezer": 1 }, recipes: [], totalRecipes: 0 });
        expect(ebf.note).toContain("Pick one from machines");
    });

    test("switches to expert mode for items only in it and keeps using it", async () => {
        const itemId = "i:nomilabs:stabilized_miner";

        const expertData = {
            item: { id: itemId, name: "Stabilized Micro Miner" },
            machineFilter: null,
            recipes: [
                {
                    type: "Assembler",
                    idx: 0,
                    eu: 480,
                    dur: 200,
                    tier: "HV",
                    heat: 0,
                    ins: "Hull (1)",
                    outs: "Miner (1)"
                }
            ],
            uses: [],
            alternatives: []
        };

        const script = [
            calls([call("search_recipes", { query: "stabilized micro miner" })]),
            calls([call("show_recipe", { itemId, idx: 0 })]),
            answer(["Stabilized Micro Miners are expert-only."]),
            extras(["What does it mine?"], [])
        ];

        const searches = [],
            shots = [];

        const bodies = await setup(script, {
            routes: {
                "GET /api/search": ({ url }) => {
                    const params = Object.fromEntries(url.searchParams);
                    searches.push(params.mode);

                    return { json: params.mode === "expert" ? expertData : { error: "not found", alternatives: [] } };
                },
                "GET /api/shot": ({ url }) => {
                    shots.push(url.searchParams.get("mode"));
                    return { json: { ok: true, abs: "https://codex.test/card.png" } };
                }
            }
        });

        await loadSources({
            codex: {
                type: "recipes",
                options: { searchUrls: [`${server.url}/api/search`], shotUrl: `${server.url}/api/shot`, mode: "normal" }
            }
        });

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("how do I make stabilized micro miners", recorder));

        expect(script).toEqual([]);
        expect(searches).toEqual(["normal", "expert"]);
        expect(shots).toEqual(["expert"]);

        const found = bodies[1].body.contents.at(-1).parts[0].functionResponse.response;
        expect(found.mode).toBe("expert");
        expect(bodies[1].body.contents.at(-1).parts.at(-1).text).toContain("The pack mode is expert");

        const final = recorder.sent.at(-1);
        expect(embedOf(final).footer.text).toMatch(/\| Expert mode$/);

        const [button] = buttonsOf(final),
            session = runtime.client.interactionHandler.getSession(button.custom_id.split(":").at(-1));

        expect(session.spec.history.at(-1)).toMatchObject({ role: "model", expert: true });
    });

    test("passes recipe roles and merged variants through and shows the recipe card", async () => {
        const itemId = "i:nomilabs:meta_dust:10";

        const recipe = (type, idx, ins, role, variants = []) => ({
            type,
            idx,
            role,
            eu: 1920,
            dur: 300,
            tier: "EV",
            heat: 0,
            ins,
            outs: "Signalum Dust (4)",
            variants
        });

        const searchData = {
            item: { id: itemId, name: "Signalum Dust" },
            machineFilter: null,
            hotChain: false,
            recipes: [
                recipe("Mixer", 0, "Annealed Copper Dust (4), Ardite Dust (2), Red Alloy Dust (2)", "make"),
                recipe("Crafting", 21, "Tiny Pile of Signalum Dust (9)", "reshape", [
                    { type: "Packager", ins: "Small Pile of Signalum Dust (4)" }
                ]),
                recipe("Pulverization", 23, "Signalum Ingot (1)", "reshape")
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
        expect(
            found.recipes.map(entry => [
                entry.itemId,
                entry.machine,
                entry.idx,
                entry.role,
                entry.seconds,
                entry.alsoIn
            ])
        ).toEqual([
            [itemId, "Mixer", 0, "make", 15, undefined],
            [itemId, "Crafting", 21, "reshape", 15, ["Packager"]],
            [itemId, "Pulverization", 23, "reshape", 15, undefined]
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

        await loadQuestbooks({ nfu: { title: "Test Pack", urls: { normal: `${server.url}/quests.json` } } });

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("what's next after iron?", recorder));

        const responseOf = idx => Util.first(bodies[idx].body.contents.at(-1).parts).functionResponse.response;

        expect(script).toEqual([]);
        expect(responseOf(1).questbook).toBe("Test Pack");
        expect(bodies[0].body.systemInstruction.parts[0].text).toContain("- Questbooks: nfu (Test Pack)");
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

    test("fetches images found from web search/pages and attaches them to embeds and files reliably", async () => {
        const script = [],
            png = Buffer.from([0x89, 0x50, 0x4e, 0x47]),
            jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

        let bodies;

        bodies = await setup(script, {
            ai: {
                tavilyKey: "tavily-key"
            },
            auth: { geminiKey: "test-key", tavilyKey: "tavily-key" },
            routes: {
                "GET /guide.html": () => ({
                    headers: { "content-type": "text/html" },
                    body: `<title>Reactor Guide</title><main><img src="/diagram_ok.png"><p>${"cool ".repeat(60)}</p></main>`
                }),
                "HEAD /diagram_head_blocked.jpg": () => ({ status: 405 }),
                "GET /diagram_head_blocked.jpg": () => ({
                    headers: { "content-type": "application/octet-stream" },
                    body: jpg
                }),
                "GET /diagram_ok.png": () => ({
                    headers: { "content-type": "image/png" },
                    body: png
                })
            }
        });

        const originalRequest = runtime.client.aiManager.http.request.bind(runtime.client.aiManager.http);

        vi.spyOn(runtime.client.aiManager.http, "request").mockImplementation(async config => {
            if (config.url === "https://api.tavily.com/search") {
                return {
                    status: 200,
                    headers: {},
                    data: {
                        results: [
                            { title: "Reactor Guide", url: `${server.url}/guide.html`, content: "Guide snippet" }
                        ],
                        images: [`${server.url}/diagram_head_blocked.jpg`]
                    }
                };
            }

            return await originalRequest(config);
        });

        script.push(
            calls([call("search_web", { query: "reactor diagram" })]),
            calls([
                call("show_image", { url: `${server.url}/diagram_head_blocked.jpg` }),
                call("attach_image", { url: `${server.url}/diagram_ok.png`, embed: true })
            ]),
            answer(["Here are the diagrams."]),
            extras([], [])
        );

        const recorder = createRecorder();
        await getCommand(runtime, "a").handler(createAskContext("find and attach reactor diagrams", recorder));

        expect(script).toEqual([]);

        const webRes = bodies[1].body.contents.at(-1).parts[0].functionResponse.response;
        expect(webRes.images).toEqual([`${server.url}/diagram_head_blocked.jpg`, `${server.url}/diagram_ok.png`]);

        const payload = recorder.sent.at(-1);
        expect(payload.files.map(file => file.name).sort()).toEqual(["diagram_head_blocked.jpg", "diagram_ok.png"]);
        expect(payload.embeds.map(embed => embed.data.image.url).sort()).toEqual([
            "attachment://diagram_head_blocked.jpg",
            "attachment://diagram_ok.png"
        ]);
        expect(payload.embeds[0].data.url).toBeUndefined();
    });

    test("reports that AI is unavailable when AIManager failed to initialize", async () => {
        runtime = await createCommandRuntime({ config: { enableAI: true } });

        expect(runtime.client.aiManager.enabled).toBe(false);

        const command = getCommand(runtime, "a"),
            out = await command.handler(createAskContext("hello", createRecorder()));

        expect(out).toContain("AI is currently unavailable");
    });
});
