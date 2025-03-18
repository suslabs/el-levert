import ExportUtil from "../util/misc/ExportUtil.js";

export { default as TagVM } from "./isolated-vm/TagVM.js";
export const TagVM2 = ExportUtil.loadOptionalModule("vm2", import.meta.url, "./vm2/TagVM2.js");
export { default as ExternalVM } from "./judge0/ExternalVM.js";
