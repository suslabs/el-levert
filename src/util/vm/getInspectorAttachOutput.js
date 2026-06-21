import { codeBlock } from "discord.js";

function getInspectorAttachOutput(info) {
    if (info == null) {
        return "";
    }

    const launchConfig = codeBlock("json", JSON.stringify(info.launchConfig, null, 4));

    return [
        "Inspector session created.",
        `DevTools: ${info.devtoolsUrl}`,
        `Target List: ${info.listUrl}`,
        `WebSocket: ${info.websocketUrl}`,
        `UUID: ${info.uuid}`,
        "VS Code launch.json:",
        launchConfig
    ].join("\n");
}

export default getInspectorAttachOutput;
