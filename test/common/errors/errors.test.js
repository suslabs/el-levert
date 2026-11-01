import { describe, expect, test } from "vitest";

import * as errors from "@el-levert/common/errors/index.js";
import CustomError from "@el-levert/common/errors/CustomError.js";
import DatabaseError from "@el-levert/common/errors/DatabaseError.js";
import ReferenceError from "@el-levert/common/errors/ReferenceError.js";

describe("common errors", () => {
    test("exports all expected error classes", () => {
        expect(typeof errors.CustomError).toBe("function");
        expect(typeof errors.ReferenceError).toBe("function");
        expect(typeof errors.DatabaseError).toBe("function");
        expect(typeof errors.CommandError).toBe("function");
        expect(typeof errors.TagError).toBe("function");
        expect(typeof errors.VMError).toBe("function");
        expect(typeof errors.UtilError).toBe("function");
        expect(typeof errors.PacketError).toBe("function");
    });

    test("CustomError supports message and causes", () => {
        const cause = new Error("inner");
        const err = new CustomError("failed operation", { cause });

        expect(err).toBeInstanceOf(Error);
        expect(err.name).toBe("CustomError");
        expect(err.message).toBe("failed operation");
        expect(err.cause).toBe(cause);
    });

    test("ReferenceError subclasses CustomError", () => {
        const err = new ReferenceError("ref error");

        expect(err).toBeInstanceOf(CustomError);
        expect(err.name).toBe("ReferenceError");
        expect(err.message).toBe("ref error");
    });

    test("DatabaseError extracts object message and preserves code/errno", () => {
        const errFromObj = new DatabaseError({ message: "syntax error", code: "SQLITE_ERROR", errno: 1 });
        expect(errFromObj.message).toBe("syntax error");
        expect(errFromObj.code).toBe("SQLITE_ERROR");
        expect(errFromObj.errno).toBe(1);

        const errFromStr = new DatabaseError("connection lost");
        expect(errFromStr.message).toBe("connection lost");
        expect(errFromStr.code).toBeUndefined();
    });
});

