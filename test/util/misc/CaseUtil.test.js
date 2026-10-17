import { describe, expect, test } from "vitest";

import CaseUtil from "../../../src/util/misc/CaseUtil.js";

describe("CaseUtil", () => {
    test("splits words from various casing formats and delimiters", () => {
        expect(CaseUtil.splitWords("helloWorld")).toEqual(["hello", "World"]);
        expect(CaseUtil.splitWords("HelloWorld")).toEqual(["Hello", "World"]);
        expect(CaseUtil.splitWords("hello_world")).toEqual(["hello", "world"]);
        expect(CaseUtil.splitWords("HELLO_WORLD")).toEqual(["HELLO", "WORLD"]);
        expect(CaseUtil.splitWords("hello-world")).toEqual(["hello", "world"]);
        expect(CaseUtil.splitWords("XMLHttpRequest")).toEqual(["XML", "Http", "Request"]);
        expect(CaseUtil.splitWords("version2Beta")).toEqual(["version", "2", "Beta"]);
        expect(CaseUtil.splitWords(["fooBar", "baz_qux"])).toEqual(["foo", "Bar", "baz", "qux"]);
        expect(CaseUtil.splitWords("")).toEqual([]);
        expect(CaseUtil.splitWords(null)).toEqual([]);
    });

    test("converts strings and word arrays to words", () => {
        expect(CaseUtil.toWords("NORMAL_CLOSURE")).toBe("normal closure");
        expect(CaseUtil.toWords("NORMAL_CLOSURE", true)).toBe("Normal Closure");
        expect(CaseUtil.toWords("helloWorld")).toBe("hello world");
        expect(CaseUtil.toWords("helloWorld", true)).toBe("Hello World");
        expect(CaseUtil.toWords("recipe_heat")).toBe("recipe heat");
        expect(CaseUtil.toWords(["hello", "world"], true)).toBe("Hello World");
        expect(CaseUtil.toWords("")).toBe("");
        expect(CaseUtil.toWords(null)).toBe("");
    });

    test("checks and converts to camel case", () => {
        expect(CaseUtil.isCamelCase("helloWorld")).toBe(true);
        expect(CaseUtil.isCamelCase("helloWorld123")).toBe(true);
        expect(CaseUtil.isCamelCase("HelloWorld")).toBe(false);
        expect(CaseUtil.isCamelCase("hello_world")).toBe(false);
        expect(CaseUtil.isCamelCase("hello-world")).toBe(false);
        expect(CaseUtil.isCamelCase("hello")).toBe(false);

        expect(CaseUtil.toCamelCase("hello_world")).toBe("helloWorld");
        expect(CaseUtil.toCamelCase("HelloWorld")).toBe("helloWorld");
        expect(CaseUtil.toCamelCase("channel-last-message-id")).toBe("channelLastMessageId");
        expect(CaseUtil.toCamelCase("HELLO world")).toBe("helloWorld");
        expect(CaseUtil.toCamelCase(["foo", "bar"])).toBe("fooBar");
        expect(CaseUtil.toCamelCase("")).toBe("");
    });

    test("checks and converts to pascal case", () => {
        expect(CaseUtil.isPascalCase("HelloWorld")).toBe(true);
        expect(CaseUtil.isPascalCase("HelloWorld123")).toBe(true);
        expect(CaseUtil.isPascalCase("helloWorld")).toBe(false);
        expect(CaseUtil.isPascalCase("HELLO_WORLD")).toBe(false);
        expect(CaseUtil.isPascalCase("hello")).toBe(false);

        expect(CaseUtil.toPascalCase("hello_world")).toBe("HelloWorld");
        expect(CaseUtil.toPascalCase("helloWorld")).toBe("HelloWorld");
        expect(CaseUtil.toPascalCase("hello-world")).toBe("HelloWorld");
        expect(CaseUtil.toPascalCase(["foo", "bar"])).toBe("FooBar");
        expect(CaseUtil.toPascalCase("")).toBe("");
    });

    test("checks and converts to snake case", () => {
        expect(CaseUtil.isSnakeCase("hello_world")).toBe(true);
        expect(CaseUtil.isSnakeCase("HELLO_WORLD")).toBe(false);
        expect(CaseUtil.isSnakeCase("HELLO_WORLD", true)).toBe(true);
        expect(CaseUtil.isSnakeCase("helloWorld")).toBe(false);
        expect(CaseUtil.isSnakeCase("hello-world")).toBe(false);

        expect(CaseUtil.toSnakeCase("helloWorld")).toBe("hello_world");
        expect(CaseUtil.toSnakeCase("hello-world")).toBe("hello_world");
        expect(CaseUtil.toSnakeCase("HelloWorld")).toBe("hello_world");
        expect(CaseUtil.toSnakeCase("helloWorld", true)).toBe("HELLO_WORLD");
        expect(CaseUtil.toSnakeCase(["foo", "bar"])).toBe("foo_bar");
        expect(CaseUtil.toSnakeCase("")).toBe("");
    });

    test("checks and converts to kebab case", () => {
        expect(CaseUtil.isKebabCase("hello-world")).toBe(true);
        expect(CaseUtil.isKebabCase("HELLO-WORLD")).toBe(false);
        expect(CaseUtil.isKebabCase("HELLO-WORLD", true)).toBe(true);
        expect(CaseUtil.isKebabCase("helloWorld")).toBe(false);
        expect(CaseUtil.isKebabCase("hello_world")).toBe(false);

        expect(CaseUtil.toKebabCase("channelLastMessageId")).toBe("channel-last-message-id");
        expect(CaseUtil.toKebabCase("hello_world")).toBe("hello-world");
        expect(CaseUtil.toKebabCase("HelloWorld")).toBe("hello-world");
        expect(CaseUtil.toKebabCase("helloWorld", true)).toBe("HELLO-WORLD");
        expect(CaseUtil.toKebabCase(["foo", "bar"])).toBe("foo-bar");
        expect(CaseUtil.toKebabCase("")).toBe("");
    });
});
