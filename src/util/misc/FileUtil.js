import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import Util from "../Util.js";

function getPlatformKey() {
    return process.platform === "win32" ? "win32" : "unix";
}

const FileUtil = Object.freeze({
    resolve: (...parts) => {
        const projRoot = globalThis.projRoot ?? process.cwd();

        if (Util.empty(parts)) {
            return path.resolve(projRoot);
        } else if (Util.single(parts) && typeof Util.first(parts) !== "string") {
            return Util.first(parts);
        }

        const values = parts.filter(part => part != null);
        return path.resolve(projRoot, ...values);
    },

    _fileUrlRegex: /^file:\/\//i,
    toFileUrl: filePath => {
        if (typeof filePath !== "string") {
            return filePath;
        }

        return FileUtil._fileUrlRegex.test(filePath) ? filePath : pathToFileURL(FileUtil.resolve(filePath)).href;
    },

    normalizeLocalPath: filePath => {
        if (typeof filePath !== "string") {
            return filePath;
        }

        return FileUtil._fileUrlRegex.test(filePath) ? fileURLToPath(filePath) : filePath;
    },

    getPathName: value => {
        if (typeof value !== "string") {
            return value;
        } else if (FileUtil._fileUrlRegex.test(value)) {
            return path.basename(fileURLToPath(value));
        } else if (/[\\/]/.test(value)) {
            return path.basename(value);
        } else {
            return value;
        }
    },

    _absolutePathRegexes: {
        win32: /^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/]+[\\/][^\\/]+|[\\/](?![\\/]))/,
        unix: /^\//
    },

    looksLikeAbsolutePath: value => {
        value = FileUtil._normalizePathValue(value);

        const exp = FileUtil._absolutePathRegexes[getPlatformKey()];

        if (Util.empty(value)) {
            return false;
        } else if (FileUtil._fileUrlRegex.test(value)) {
            return true;
        }

        return exp.test(value);
    },

    _relativePathRegexes: {
        win32: [
            /^\.{1,2}(?:[\\/]|$)/,
            /^(?![A-Za-z]+:)(?:[^\\/:*?"<>|\r\n]+[\\/])+[^\\/:*?"<>|\r\n]*$/,
            /^(?![A-Za-z]+:)(?:\.?[^\\/:*?"<>|\r\n]+)(?:\.[^\\/:*?"<>|\r\n]+)+$/,
            /^\.[^\\/.\r\n][^\\/\r\n]*$/
        ],
        unix: [
            /^\.{1,2}(?:\/|$)/,
            /^(?![A-Za-z]+:)(?:[^/\0\r\n]+\/)+[^/\0\r\n]*$/,
            /^(?![A-Za-z]+:)(?:\.?[^/\0\r\n]+)(?:\.[^/\0\r\n]+)+$/,
            /^\.[^/.\0\r\n][^/\0\r\n]*$/
        ]
    },

    looksLikeRelativePath: value => {
        value = FileUtil._normalizePathValue(value);

        const absoluteExp = FileUtil._absolutePathRegexes[getPlatformKey()],
            exps = FileUtil._relativePathRegexes[getPlatformKey()];

        if (Util.empty(value) || FileUtil._fileUrlRegex.test(value) || absoluteExp.test(value)) {
            return false;
        }

        return exps.some(exp => exp.test(value));
    },

    looksLikePath: value => FileUtil.looksLikeAbsolutePath(value) || FileUtil.looksLikeRelativePath(value),

    isDirectory: async filePath => {
        return await FileUtil._checkPathType(filePath, "directory");
    },

    isFile: async filePath => {
        return await FileUtil._checkPathType(filePath, "file");
    },

    _normalizePathValue: value => {
        return typeof value === "string" ? value.trim() : "";
    },

    _checkPathType: async (filePath, type) => {
        try {
            const stat = await fs.stat(FileUtil.normalizeLocalPath(filePath));

            switch (type) {
                case "directory":
                    return stat.isDirectory();
                case "file":
                    return stat.isFile();
                default:
                    return false;
            }
        } catch (err) {
            return err.code === "ENOENT"
                ? false
                : (() => {
                      throw err;
                  })();
        }
    }
});

export default FileUtil;
