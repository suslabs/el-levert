import BaseCommandInfo from "./BaseCommandInfo.js";

class WebsocketCommandInfo extends BaseCommandInfo {
    static defaultValues = {
        ...BaseCommandInfo.defaultValues,
        arguments: {},
        response: {}
    };

    static dataProps = [...BaseCommandInfo.dataProps, "arguments", "response"];
}

export default WebsocketCommandInfo;
