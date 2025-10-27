import Util from "../../../util/Util.js";
import RegexUtil from "../../../util/misc/RegexUtil.js";
import Codegen from "../../../util/vm/Codegen.js";

const name = `ManevraError__${Util.randomString(16)}`,
    replaceNames = ["message", "name", "stack"];

const targetRegex = new RegExp(
    `^${RegexUtil.escapeRegex(
        `Error\n    at ${name}.rethrow (<isolated-vm>:lineNum:colNum)\n    at ${name}.get [as propNames] (<isolated-vm>:lineNum:colNum)`
    )
        .replaceAll("propNames", `(?:${replaceNames.map(name => RegexUtil.escapeRegex(name)).join("|")})`)
        .replace(/(line|col)Num/g, "\\d+")}$`
);

const ctor = Codegen.function(
    "constructor",
    Codegen.assignment("message", '""', false),
    [
        Codegen.call("super", "message"),
        Codegen.assignment(Codegen.access(["this", "name"]), Codegen.access(["this", "constructor", "name"])),
        Codegen.declaration(
            "rethrow",
            Codegen.function(
                null,
                ["propName"],
                [
                    Codegen.declaration("errInfo", Codegen.access([Codegen.instantiate("Error", [], false), "stack"])),
                    Codegen.if(
                        Codegen.call(Codegen.access([targetRegex.toString(), "test"]), "errInfo", false),
                        [
                            Codegen.call(
                                Codegen.access([JSON.stringify(replaceNames), "forEach"]),
                                Codegen.function(
                                    null,
                                    ["name"],
                                    Codegen.statement(
                                        "delete " +
                                            Codegen.access([
                                                "this",
                                                {
                                                    name: "name",
                                                    dynamic: true
                                                }
                                            ])
                                    ),
                                    { arrow: true }
                                )
                            ),
                            Codegen.call(Codegen.access(["Object", "defineProperties"]), [
                                "this",
                                Codegen.access(["this", "_originalDesc"])
                            ]),
                            Codegen.statement("delete " + Codegen.access(["this", "_originalDesc"])),
                            Codegen.return(
                                Codegen.access([
                                    "this",
                                    {
                                        name: "propName",
                                        dynamic: true
                                    }
                                ])
                            )
                        ].join("\n"),
                        Codegen.throw(null, "this")
                    )
                ].join("\n")
            ),
            true
        ),
        Codegen.assignment(
            Codegen.access(["this", "_originalDesc"]),
            Codegen.call(
                Codegen.access(["Object", "fromEntries"]),
                Codegen.call(
                    Codegen.access([JSON.stringify(replaceNames), "map"]),
                    Codegen.function(
                        null,
                        ["name"],
                        Codegen.return(
                            Codegen.array([
                                "name",
                                Codegen.call(
                                    Codegen.access(["Object", "getOwnPropertyDescriptor"]),
                                    ["this", "name"],
                                    false
                                )
                            ])
                        ),
                        { arrow: true }
                    ),
                    false
                ),
                false
            )
        ),
        Codegen.call(Codegen.access(["Object", "defineProperties"]), [
            "this",
            Codegen.object(
                Object.fromEntries(
                    replaceNames.map(name => [
                        name,
                        Codegen.object(
                            {
                                get: Codegen.function(
                                    null,
                                    [],
                                    Codegen.return(
                                        Codegen.call(
                                            Codegen.access(["rethrow", "call"]),
                                            ["this", Codegen.string(name)],
                                            false
                                        )
                                    ),
                                    {
                                        arrow: true
                                    }
                                ),
                                configurable: true,
                                enumerable: true
                            },
                            false
                        )
                    ])
                ),
                false
            )
        ])
    ].join("\n"),

    { class: true }
);

const _class = Codegen.class(name, "Error", ctor),
    ManevraError = Codegen.getObject(_class);

export default ManevraError;
