import Util from "../../../util/Util.js";
import Codegen from "../../../util/vm/Codegen.js";

const name = `ManevraError__${Util.randomString(16)}`;

const ctor = Codegen.function(
    "constructor",
    Codegen.assignment("message", "{}", false),

    [
        Codegen.call("super", "message"),
        Codegen.assignment(Codegen.access(["this", "name"]), Codegen.access(["this", "constructor", "name"]))
    ].join("\n"),

    { class: true }
);

const _class = Codegen.class(name, "Error", ctor);

export default Codegen.getObject(_class);
