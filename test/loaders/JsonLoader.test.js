import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import "../../setupGlobals.js";
import JsonLoader from "../../src/loaders/JsonLoader.js";
import LoadStatus from "../../src/loaders/LoadStatus.js";
import WriteModes from "../../src/loaders/WriteModes.js";

class TestJsonLoader extends JsonLoader {
    validate(data) {
        return data.ok === true;
    }
}

let tempDir;
let filePath;

beforeEach(async () => {
    tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "el-levert-json-loader-"));
    filePath = path.join(tempDir, "sample.json");
    await fsPromises.writeFile(filePath, JSON.stringify({ ok: true }));
});

afterEach(async () => {
    await fsPromises.rm(tempDir, { recursive: true, force: true });
});

describe("JsonLoader", () => {
    test("parses json and validates writes", async () => {
        const loader = new TestJsonLoader("json", filePath, null, {
            sync: true,
            spaces: 2,
            throwOnFailure: false
        });

        expect(loader.load()).toEqual([{ ok: true }, LoadStatus.successful]);
        expect(loader.write({ ok: true })).toBe(LoadStatus.successful);
        expect(() => loader.write({ ok: false })).not.toThrow();
        expect(loader.write({ ok: false })).toBe(LoadStatus.failed);
    });
});

describe("Merged Branch Coverage", () => {
    class TestJsonLoader extends JsonLoader {
        validate(data) {
            if (Array.isArray(data)) {
                return [false, "Arrays are not allowed"];
            }

            return data?.ok !== false;
        }
    }

    let tempDir;
    let filePath;
    let schemaDir;

    function createLogger() {
        return {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn()
        };
    }

    beforeEach(async () => {
        tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "el-levert-json-loader-branches-"));
        schemaDir = path.join(tempDir, "schema");
        filePath = path.join(tempDir, "sample.json");

        await fsPromises.mkdir(schemaDir, { recursive: true });
        await fsPromises.writeFile(filePath, JSON.stringify({ ok: true, value: 1 }));
        await fsPromises.writeFile(
            path.join(schemaDir, "sample.schema.json"),
            JSON.stringify({
                $id: "sample-schema",
                type: "object",
                required: ["ok"],
                properties: {
                    ok: {
                        type: "boolean"
                    }
                }
            })
        );
    });

    afterEach(async () => {
        await fsPromises.rm(tempDir, { recursive: true, force: true });
    });

    describe("JsonLoader branch coverage", () => {
        test("covers schema helpers, parser failures, and append writes", () => {
            expect(JsonLoader._getSchemaPath(filePath, { schemaPath: "custom.json" })).toBe("custom.json");
            expect(JsonLoader._getSchemaPath(null, {})).toBeNull();
            expect(JsonLoader._formatValidationErrors([{ instancePath: "/prop/value", message: "is invalid" }])).toBe(
                "Property prop.value is invalid"
            );

            const logger = createLogger();
            const invalidPath = path.join(tempDir, "invalid.json");
            fs.writeFileSync(invalidPath, "{invalid");

            const invalidLoader = new TestJsonLoader("json", invalidPath, logger, {
                sync: true,
                throwOnFailure: false
            });

            expect(invalidLoader.load()).toEqual([null, LoadStatus.failed]);

            const appendLoader = new TestJsonLoader("json", filePath, logger, {
                sync: true,
                throwOnFailure: false
            });

            expect(appendLoader.load()).toEqual([{ ok: true, value: 1 }, LoadStatus.successful]);
            expect(appendLoader.write({ extra: 2 }, {}, WriteModes.append)).toBe(LoadStatus.successful);
            expect(JSON.parse(fs.readFileSync(filePath, "utf8"))).toEqual({
                ok: true,
                value: 1,
                extra: 2
            });

            expect(appendLoader.write([], {})).toBe(LoadStatus.failed);
        });

        test("covers forced and skipped schema validation as well as custom stringify", async () => {
            const logger = createLogger();
            const skipSchemaLoader = new TestJsonLoader("json", filePath, logger, {
                sync: true,
                throwOnFailure: false,
                validateWithSchema: true,
                forceSchemaValidation: false
            });

            expect(skipSchemaLoader.load()).toEqual([{ ok: true, value: 1 }, LoadStatus.successful]);
            expect(logger.warn).toHaveBeenCalledWith("Schema validation skipped");

            const forcedLoader = new TestJsonLoader("json", filePath, logger, {
                sync: true,
                throwOnFailure: false,
                validateWithSchema: true,
                forceSchemaValidation: true
            });

            expect(forcedLoader.load()).toEqual([null, LoadStatus.failed]);

            const schemaLoader = new TestJsonLoader("json", filePath, logger, {
                sync: false,
                throwOnFailure: false,
                validateWithSchema: true,
                schema: {
                    $id: "inline-schema",
                    type: "object",
                    required: ["ok"],
                    properties: {
                        ok: {
                            type: "boolean"
                        }
                    }
                }
            });

            await expect(schemaLoader.load()).resolves.toEqual([{ ok: true, value: 1 }, LoadStatus.successful]);
            await expect(schemaLoader.write({ ok: true }, { stringify: () => "custom-json" })).resolves.toBe(
                LoadStatus.successful
            );
            expect(await fsPromises.readFile(filePath, "utf8")).toBe("custom-json");
        });
    });
});
