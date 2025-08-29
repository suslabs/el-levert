import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

import "../../setupGlobals.js";

const MockMapPath = path.resolve(projRoot, process.env.MOCK_MAP_PATH || "mock-map.json"),
    MockMap = JSON.parse(fs.readFileSync(MockMapPath, "utf8"));

const MockUrls = new Map(
        Object.entries(MockMap).map(([moduleName, relativePath]) => {
            const absolutePath = path.resolve(projRoot, relativePath);
            return [moduleName, pathToFileURL(absolutePath).href];
        })
    ),
    MockFiles = new Set(MockUrls.values());

function extractModuleName(specifier) {
    if (specifier.startsWith("file://")) {
        const filePath = fileURLToPath(specifier);
        return path.basename(filePath);
    } else if (/[/\\]/.test(specifier)) {
        return path.basename(specifier);
    } else {
        return specifier;
    }
}

export function resolve(specifier, context, nextResolve) {
    const externalModule = context.parentURL?.includes("node_modules") ?? true;

    if (externalModule || MockFiles.has(context.parentURL)) {
        return nextResolve(specifier, context);
    }

    const moduleName = extractModuleName(specifier),
        mockUrl = MockUrls.get(moduleName);

    return nextResolve(mockUrl ?? specifier, context);
}
