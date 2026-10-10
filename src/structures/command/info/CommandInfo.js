import TextCommandInfo from "./TextCommandInfo.js";

class CommandInfo extends TextCommandInfo {
    static invalidValues = {
        ...TextCommandInfo.invalidValues
    };

    static defaultValues = {
        ...TextCommandInfo.defaultValues,
        allowed: 0,
        ownerOnly: false
    };

    static dataProps = [...TextCommandInfo.dataProps, "allowed", "ownerOnly"];

    toObject() {
        return {
            ...super.toObject(),
            allowed: this.allowed,
            ownerOnly: this.ownerOnly
        };
    }
}

export default CommandInfo;
