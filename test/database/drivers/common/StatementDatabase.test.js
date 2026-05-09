import { describe, expect, test } from "vitest";

import StatementDatabase from "../../../../src/database/drivers/common/StatementDatabase.js";

class BaseDatabase {
    constructor() {
        this.throwErrors = true;
    }
}

class ExampleDatabase extends StatementDatabase(BaseDatabase) {}

function makeStatement(finalized = false) {
    return {
        finalized,
        finalize: async function finalize() {
            this.finalized = true;
        }
    };
}

describe("StatementDatabase", () => {
    test("adds, removes, finalizes, and ignores already-finalized statements", async () => {
        const db = new ExampleDatabase();
        const first = makeStatement();
        const second = makeStatement(true);

        db.addStatement(first);
        db.addStatement(second);

        expect(db.removeStatement(first)).toBe(true);
        db.addStatement(first);

        await db.finalizeStatement(first);
        expect(first.finalized).toBe(true);
        expect(db.statements.includes(first)).toBe(false);

        await db.finalizeAll();
        expect(second.finalized).toBe(true);

        expect(() => db.removeStatement({})).toThrow("Statement not found");
        db.throwErrors = false;
        expect(db.removeStatement({})).toBe(false);
    });
});
