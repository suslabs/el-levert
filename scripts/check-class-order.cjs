const fs = require("node:fs"),
    path = require("node:path");

const parser = require("@babel/parser"),
    traverse = require("@babel/traverse").default;

const ROOT = path.resolve(__dirname, "..");

const DIRS = [path.join(ROOT, "src"), path.join(ROOT, "scripts")];

class ClassOrderChecker {
    static getFiles(dir) {
        let results = [];

        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                results = results.concat(this.getFiles(fullPath));
            } else if (entry.isFile() && (entry.name.endsWith(".js") || entry.name.endsWith(".cjs"))) {
                results.push(fullPath);
            }
        }

        return results;
    }

    static checkClass(classPath, file) {
        const className = classPath.node.id ? classPath.node.id.name : "<anonymous>",
            body = classPath.node.body.body,
            relFile = path.relative(ROOT, file);

        const members = body.map(m => this._extractClassMember(m));

        if (members.length <= 1) {
            return [];
        }

        const issues = [];

        const normRelFile = relFile.replace(/\\/g, "/");

        const isFake = className.startsWith("Fake"),
            isUtil =
                className.endsWith("Util") ||
                className.endsWith("Utils") ||
                className === "Util" ||
                normRelFile.includes("/util/") ||
                normRelFile.includes("/utils/") ||
                normRelFile.startsWith("src/util/");

        let seenPublicInstance = false,
            seenPrivate = false,
            seenPrivateInstance = false;

        for (const m of members) {
            if (m.isStaticBlock) {
                if (seenPrivate && !isUtil) {
                    if (seenPrivateInstance) {
                        issues.push(`[Line ${m.line}] Static block appears after private instance member.`);
                    }
                } else {
                    if (seenPublicInstance && !isFake) {
                        issues.push(`[Line ${m.line}] Static block appears after public instance member.`);
                    }
                }

                continue;
            }

            if (!m.isPrivate) {
                if (seenPrivate && !isUtil) {
                    issues.push(
                        `[Line ${m.line}] Public ${m.isStatic ? "static" : "instance"} "${m.name}" appears after private section.`
                    );
                }

                if (m.isStatic) {
                    if (seenPublicInstance && !isFake) {
                        issues.push(`[Line ${m.line}] Public static "${m.name}" appears after public instance member.`);
                    }
                } else {
                    seenPublicInstance = true;
                }
            } else {
                seenPrivate = true;

                if (m.isStatic) {
                    if (seenPrivateInstance && !isUtil) {
                        issues.push(
                            `[Line ${m.line}] Private static "${m.name}" appears after private instance member.`
                        );
                    }
                } else {
                    seenPrivateInstance = true;
                }
            }
        }

        return issues.map(iss => `${relFile} -> ${className}: ${iss}`);
    }

    static run() {
        const files = DIRS.flatMap(dir => this.getFiles(dir));

        let totalIssues = 0;

        for (const file of files) {
            const code = fs.readFileSync(file, "utf8");

            let ast;

            try {
                ast = parser.parse(code, {
                    sourceType: "module",
                    plugins: ["importAssertions", "classProperties", "classPrivateProperties", "classPrivateMethods"]
                });
            } catch {
                try {
                    ast = parser.parse(code, {
                        sourceType: "script",
                        plugins: ["classProperties", "classPrivateProperties", "classPrivateMethods"]
                    });
                } catch (err) {
                    console.error(`Failed to parse ${file}: ${err.message}`);
                    continue;
                }
            }

            traverse(ast, {
                Class: classPath => {
                    const issues = this.checkClass(classPath, file);

                    if (issues.length > 0) {
                        totalIssues += issues.length;

                        for (const iss of issues) {
                            console.log(iss);
                        }
                    }
                }
            });
        }

        console.log(`\nTotal section ordering violations found: ${totalIssues}`);
        process.exit(totalIssues > 0 ? 1 : 0);
    }

    static _extractClassMember(member) {
        let name = "";

        if (member.key) {
            name = member.key.name || member.key.value || "";
        }

        const line = member.loc ? member.loc.start.line : 0,
            kind = member.kind || "property";

        const isStatic = !!member.static || member.type === "StaticBlock",
            isPrivate = name.startsWith("_") || member.key?.type === "PrivateIdentifier";

        return {
            name,
            line,
            kind,
            isStatic,
            isPrivate,
            isStaticBlock: member.type === "StaticBlock"
        };
    }
}

ClassOrderChecker.run();
