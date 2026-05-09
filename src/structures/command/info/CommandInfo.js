import TextCommandInfo from "./TextCommandInfo.js";

class CommandInfo extends TextCommandInfo {
    static dataProps = [...TextCommandInfo.dataProps, "allowed", "ownerOnly"];

    static invalidValues = {
        ...TextCommandInfo.invalidValues
    };

    static defaultValues = {
        ...TextCommandInfo.defaultValues,
        allowed: 0,
        ownerOnly: false
    };

    toObject() {
        return {
            ...super.toObject(),
            allowed: this.allowed,
            ownerOnly: this.ownerOnly
        };
    }
}

export default CommandInfo;
