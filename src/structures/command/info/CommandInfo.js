import TextCommandInfo from "./TextCommandInfo.js";

class CommandInfo extends TextCommandInfo {
    static defaultValues = {
        ...TextCommandInfo.defaultValues,
        allowed: 0,
        ownerOnly: false,
        continueOnReply: false
    };

    static dataProps = [...TextCommandInfo.dataProps, "allowed", "ownerOnly", "continueOnReply"];
}

export default CommandInfo;
