import TextCommandInfo from "./TextCommandInfo.js";

class CommandInfo extends TextCommandInfo {
    static defaultValues = {
        ...TextCommandInfo.defaultValues,
        allowed: 0,
        ownerOnly: false
    };

    static dataProps = [...TextCommandInfo.dataProps, "allowed", "ownerOnly"];
}

export default CommandInfo;
