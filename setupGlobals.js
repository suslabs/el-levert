import { pathToFileURL } from "node:url";

Error.stackTraceLimit = 20;

globalThis.projRoot = import.meta.dirname;
globalThis.projRootUrl = pathToFileURL(import.meta.dirname).href;
