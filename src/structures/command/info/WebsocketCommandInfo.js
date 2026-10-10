import BaseCommandInfo from "./BaseCommandInfo.js";

class WebsocketCommandInfo extends BaseCommandInfo {
    static defaultValues = {
        ...BaseCommandInfo.defaultValues,
        arguments: {},
        response: {}
    };

    static dataProps = [...BaseCommandInfo.dataProps, "arguments", "response"];

    toObject() {
        return {
            ...super.toObject(),
            arguments: structuredClone(this.arguments),
            response: structuredClone(this.response)
        };
    }
}

export default WebsocketCommandInfo;
