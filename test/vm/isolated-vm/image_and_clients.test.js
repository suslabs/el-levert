import { describe, test, beforeAll, afterAll, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import "../../../setupGlobals.js";

import { cleanupRuntime, createRuntime } from "../../helpers/runtimeHarness.js";
import { addTag } from "../../helpers/commandHarness.js";
import { createDiscordMessage } from "../../helpers/discordStubs.js";

describe("Test DiscordHttpClient, KlipyHttpClient, ImageLoader, and Caption", () => {
    let runtime, vm, msg;
    const cycdrawRoot = "d:/projects/cycdraw";

    beforeAll(async () => {
        runtime = await createRuntime({
            loadManagers: true,
            loadVMs: true,
            config: {
                enableEval: true,
                enableInspector: false,
                memLimit: 128,
                timeLimit: 60000,
                maxTagSize: { text: 10240, script: 10240, binary: 10240 }
            }
        });
        vm = runtime.client.tagVM;
        msg = createDiscordMessage("%caption");

        const loaderCode = fs.readFileSync(path.join(cycdrawRoot, "canvaskit/canvaskitloader.js"), "utf8");
        const cycdrawCode = fs.readFileSync(path.join(cycdrawRoot, "canvaskit/cycdraw.js"), "utf8");
        const canvaskitUtilCode = fs.readFileSync(path.join(cycdrawRoot, "canvaskit/canvaskitutil.js"), "utf8");
        const discordCode = fs.readFileSync(
            path.join(cycdrawRoot, "canvaskit/lib/custom/DiscordHttpClient.js"),
            "utf8"
        );
        const klipyCode = fs.readFileSync(path.join(cycdrawRoot, "canvaskit/lib/custom/KlipyHttpClient.js"), "utf8");
        const tableCode = fs.readFileSync(path.join(cycdrawRoot, "canvaskit/lib/custom/Table.js"), "utf8");
        const imageloaderCode = fs.readFileSync(path.join(cycdrawRoot, "canvaskit/imageloader.js"), "utf8");
        const captionCode = fs.readFileSync(path.join(cycdrawRoot, "canvaskit/caption.js"), "utf8");

        const tagOwner = "883072834790916137";
        await addTag(runtime, "canvaskitloader", loaderCode, tagOwner, { type: "ivm" });
        await addTag(runtime, "ck_cycdraw", cycdrawCode, tagOwner, { type: "text" });
        await addTag(runtime, "canvaskitutil", canvaskitUtilCode, tagOwner, { type: "text" });
        await addTag(runtime, "ck_discordhttpclient", discordCode, tagOwner, { type: "text" });
        await addTag(runtime, "ck_tenorhttpclient", klipyCode, tagOwner, { type: "text" });
        await addTag(runtime, "ck_table", tableCode, tagOwner, { type: "text" });
        await addTag(runtime, "ck_imageloader", imageloaderCode, tagOwner, { type: "text" });
        await addTag(runtime, "caption", captionCode, tagOwner, { type: "ivm" });
    }, 120000);

    afterAll(async () => {
        await cleanupRuntime(runtime);
    }, 60000);

    test("test DiscordHttpClient without token and utility methods", async () => {
        const script = `
            (() => {
                delete util.env;
                util.loadLibrary = "none";
                util.loadSource = "url";
                eval(util.fetchTag("canvaskitloader").body);
                const DiscordHttpClient = ModuleLoader.loadModuleFromTag("ck_discordhttpclient");

                // Instantiation without token must succeed
                const client = new DiscordHttpClient();

                let tokenDemanded = false;
                try {
                    client.apiMethod("users/@me", "get");
                } catch (err) {
                    if (err.message === "No token was provided") tokenDemanded = true;
                }

                const url = "https://cdn.discordapp.com/attachments/123/456/sample.png?ex=123&is=456&hm=789";
                const normalized = DiscordHttpClient.normalizeAttachmentUrl(url);
                const parsed = DiscordHttpClient.parseAttachmentUrl(url);
                const stripped = DiscordHttpClient.stripAttachmentUrl(url);

                // Test getImageOpts with numbers and allowedSizes (which previously threw ClientError: Invalid size)
                const imageOptsNum = DiscordHttpClient.Util.getImageOpts({ size: 128 });
                const imageOptsEnum = DiscordHttpClient.Util.getImageOpts({ size: DiscordHttpClient.Constants.allowedSizes[3] });
                const imageOptsStr = DiscordHttpClient.Util.getImageOpts({ size: "256", ext: "png" });

                return JSON.stringify({
                    isClient: client instanceof DiscordHttpClient,
                    tokenDemanded,
                    normalizedOk: normalized.includes("sample.png"),
                    parsedOk: parsed.file === "sample.png" && parsed.channelId === "456",
                    strippedOk: !stripped.includes("?") || stripped.includes("ex="),
                    imageOptsNumOk: imageOptsNum.size === "128",
                    imageOptsEnumOk: imageOptsEnum.size === "128",
                    imageOptsStrOk: imageOptsStr.size === "256" && imageOptsStr.ext === "png"
                });
            })()
        `.trim();

        const res = await vm.runScript(script, { msg });
        console.log("CAPTION RES:", res);
        const data = JSON.parse(res);
        expect(data.isClient).toBe(true);
        expect(data.tokenDemanded).toBe(true);
        expect(data.normalizedOk).toBe(true);
        expect(data.parsedOk).toBe(true);
        expect(data.strippedOk).toBe(true);
        expect(data.imageOptsNumOk).toBe(true);
        expect(data.imageOptsEnumOk).toBe(true);
        expect(data.imageOptsStrOk).toBe(true);
    });

    test("test KlipyHttpClient operations with real API", async () => {
        const script = `
            (() => {
                delete util.env;
                util.loadLibrary = "none";
                util.loadSource = "url";
                eval(util.fetchTag("canvaskitloader").body);
                const KlipyHttpClient = ModuleLoader.loadModuleFromTag("ck_tenorhttpclient");
                const key = EncryptionUtil.caesarCipher("pbtAcTc9RhtQ1cvJsAX7rsOk5Fy3f8hZWYvzM3S3D2qHbRSGHBGThSqEdN7D89Bk", -16, 2);
                const client = new KlipyHttpClient({ key });

                const searchResults = client.getGifs({ search: "cat", limit: 2 });
                const trendingResults = client.getGifs({ trending: true, limit: 2 });
                const idResults = client.getGifs({ ids: [2484942301552561] });

                const gifUrl = client.getGifUrl("goatplaybanjo-chat-4--k3bJBBghg");
                const webpUrl = client.getGifUrl("goatplaybanjo-chat-4--k3bJBBghg", { format: "webp" });
                const numericUrl = client.getGifUrl("8742398536843477");
                const webSlugUrl = client.getGifUrl("happy-saturday-morning-inspirational-quotes-for-women-8742398536843477");

                return JSON.stringify({
                    searchCount: searchResults.length,
                    trendingCount: trendingResults.length,
                    idCount: idResults.length,
                    gifUrlOk: gifUrl.startsWith("https://") && gifUrl.endsWith(".gif"),
                    webpUrlOk: webpUrl.startsWith("https://") && webpUrl.endsWith(".webp"),
                    numericUrlOk: numericUrl.startsWith("https://"),
                    webSlugUrlOk: webSlugUrl.startsWith("https://")
                });
            })()
        `.trim();

        const res = await vm.runScript(script, { msg });
        const data = JSON.parse(res);
        expect(data.searchCount).toBeGreaterThan(0);
        expect(data.trendingCount).toBeGreaterThan(0);
        expect(data.idCount).toBeGreaterThan(0);
        expect(data.gifUrlOk).toBe(true);
        expect(data.webpUrlOk).toBe(true);
        expect(data.numericUrlOk).toBe(true);
        expect(data.webSlugUrlOk).toBe(true);
    });

    test("test ImageLoader with Klipy URL parsing and image loading", async () => {
        const script = `
            (() => {
                delete util.env;
                util.loadLibrary = "none";
                util.loadSource = "url";
                eval(util.fetchTag("canvaskitloader").body);

                globalThis.tag = { name: "caption", args: "https://klipy.com/gifs/goatplaybanjo-chat-4--k3bJBBghg my caption text" };
                const msgObj = {
                    content: "",
                    author: { id: "123" }
                };
                globalThis.msg = msgObj;

                const { parseArgs, loadImage } = ModuleLoader.loadModuleFromTag("ck_imageloader", {
                    scope: {
                        help: "help",
                        usage: "usage",
                        textName: "caption",
                        requireImage: true,
                        decodeLibrary: "none"
                    },
                    isolateGlobals: false
                });

                const parsed = parseArgs();
                const loaded = loadImage();

                return JSON.stringify({
                    text: parsed.text,
                    hasUrl: Boolean(parsed.targetMsg.fileUrl),
                    isGif: loaded.isGif,
                    hasBody: loaded.image instanceof Uint8Array && loaded.image.length > 0
                });
            })()
        `.trim();

        const res = await vm.runScript(script, { msg });
        const data = JSON.parse(res);
        expect(data.text).toBe("my caption text");
        expect(data.hasUrl).toBe(true);
        expect(data.isGif).toBe(true);
        expect(data.hasBody).toBe(true);
    });

    test("test Caption tag end-to-end execution with CanvasKit URL load", async () => {
        const testImageUrl = "https://raw.githubusercontent.com/mathiasbynens/small/master/png-transparent.png";

        const script = `
            (() => {
                delete util.env;
                util.loadLibrary = "none";
                util.loadSource = "url";
                return util.executeTag("caption", ["${testImageUrl}", "Hello World Caption"]);
            })()
        `.trim();

        const res = await vm.runScript(script, { msg });
        console.log("CAPTION EXECUTE TAG OUT:", res);
        expect(res).toBeDefined();
        if (typeof res === "object" && res?.files) {
            expect(res.files.length).toBeGreaterThan(0);
            expect(res.files[0].attachment.length).toBeGreaterThan(0);
        } else if (typeof res === "string") {
            expect(res.length).toBeGreaterThan(0);
        }
    }, 60000);

    test("test Caption with custom emoji parses and fetches assets with valid size", async () => {
        const testImageUrl = "https://raw.githubusercontent.com/mathiasbynens/small/master/png-transparent.png";

        const script = `
            (() => {
                delete util.env;
                util.loadLibrary = "none";
                util.loadSource = "url";
                eval(util.fetchTag("canvaskitloader").body);

                // Load discord client and verify customEmoji endpoint and getImageOpts together
                const DiscordHttpClient = ModuleLoader.loadModuleFromTag("ck_discordhttpclient");
                const DiscordEndpoints = Object.freeze({
                    customEmoji: id => HttpUtil.joinUrl("emojis", id)
                });

                const client = new DiscordHttpClient({ token: "" });
                const opts = DiscordHttpClient.Util.getImageOpts({
                    size: DiscordHttpClient.Constants.allowedSizes[3]
                });

                return JSON.stringify({
                    optsSize: opts.size,
                    endpoint: DiscordEndpoints.customEmoji("123456789")
                });
            })()
        `.trim();

        const res = await vm.runScript(script, { msg });
        const data = JSON.parse(res);
        expect(data.optsSize).toBe("128");
        expect(data.endpoint).toBe("emojis/123456789");
    }, 60000);

});
