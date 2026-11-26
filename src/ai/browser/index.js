import ModuleUtil from "../../util/misc/ModuleUtil.js";

export const browserDependencies = ["puppeteer", "puppeteer-extra", "puppeteer-extra-plugin-stealth"];

export function loadStealthBrowser() {
    return ModuleUtil.loadOptionalModule(browserDependencies, import.meta.url, "./StealthBrowser.js");
}
