import { describe, expect, test } from "vitest";

import GroupCommandReader from "../../../../src/parsers/command/reader/GroupCommandReader.js";

import CommandParseSession from "../../../../src/parsers/command/structs/CommandParseSession.js";
import CommandArgumentResult from "../../../../src/parsers/command/structs/CommandArgumentResult.js";

describe("GroupCommandReader", () => {
    test("assembles group object from child results in session", () => {
        const reader = new GroupCommandReader({
            properties: {
                host: { name: "server_host" },
                port: { name: "server_port" }
            }
        });

        const session = new CommandParseSession({});

        session.addResult(new CommandArgumentResult("server_host", "localhost", "localhost", true));
        session.addResult(new CommandArgumentResult("server_port", "8080", 8080, true));

        expect(reader.read(session)).toEqual({
            host: "localhost",
            port: 8080
        });
    });

    test("omits undefined child results", () => {
        const reader = new GroupCommandReader({
            properties: {
                present: { name: "item_present" },
                missing: { name: "item_missing" }
            }
        });

        const session = new CommandParseSession({});

        session.addResult(new CommandArgumentResult("item_present", "val", "val", true));

        expect(reader.read(session)).toEqual({
            present: "val"
        });
    });
});
