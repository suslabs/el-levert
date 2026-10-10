import Util from "../../util/Util.js";
import DiscordUtil from "../../util/DiscordUtil.js";
import ObjectUtil from "../../util/ObjectUtil.js";

class User {
    static defaultValues = {
        id: 0,
        user: "0",
        group: "",
        username: ""
    };

    static from(data, nullable = false, ...args) {
        if (nullable && data === null) {
            return null;
        }

        return data instanceof this ? data : new this(data, ...args);
    }

    constructor(data) {
        ObjectUtil.setValuesWithDefaults(this, data, this.constructor.defaultValues);
    }

    getData(prefix = "", nullable = true, props = this.constructor.dataProps) {
        const data = ObjectUtil.filterObject(this, key => props.includes(key));

        if (nullable) {
            for (const prop of this.constructor._nullableDataProps.filter(prop => props.includes(prop))) {
                data[prop] ||= null;
            }
        }

        return Object.fromEntries(Object.entries(data).map(entry => [prefix + entry[0], entry[1]]));
    }

    setUserId(id) {
        this.user = id;
    }

    setGroup(group) {
        this.group = group;
    }

    setUsername(username) {
        this.username = username ?? "NOT FOUND";
    }

    format(discord = false) {
        return DiscordUtil.formatUser(this.username, this.user, discord);
    }

    static dataProps = ["id", "user", "group"];
    static _nullableDataProps = [];
}

export default User;
