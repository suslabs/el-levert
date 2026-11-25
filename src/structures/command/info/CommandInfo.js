import TextCommandInfo from "./TextCommandInfo.js";

class CommandInfo extends TextCommandInfo {
    static defaultValues = {
        ...TextCommandInfo.defaultValues,
        allowed: 0,
        ownerOnly: false,
        continueOnReply: false,
        logContent: true
    };

    static dataProps = [...TextCommandInfo.dataProps, "allowed", "ownerOnly", "continueOnReply", "logContent"];
}

export default CommandInfo;
