import ivm from "isolated-vm";

import { getClient } from "../../../LevertClient.js";
import VMUtil from "../../util/VMUtil.js";

const FakeUtil = {
    findUsers: async search => {
        let data = await getClient().findUsers(search);

        data = data.map(x => ({
            guildId: x.guild.id,
            joinedTimestamp: x.joinedTimestamp,
            premiumSinceTimestamp: x.premiumSinceTimestamp,
            nickname: x.nickname,
            pending: x.pending,
            communicationDisabledUntilTimestamp: x.communicationDisabledUntilTimestamp,
            userId: x.user.id,
            avatar: x.user.avatar,
            displayName: x.displayName,
            roles: x._roles,
            avatarURL: x.user.avatarURL(),
            displayAvatarURL: x.user.displayAvatarURL(),
            id: x.user.id,
            bot: x.bot,
            system: x.system,
            flags: x.flags,
            username: x.user.username,
            discriminator: x.user.discriminator,
            banner: x.user.banner,
            accentColor: x.user.accentColor,
            createdTimestamp: x.user.createdTimestamp,
            defaultAvatarURL: x.user.defaultAvatarURL,
            hexAccentColor: x.user.hexAccentColor,
            tag: x.user.tag
        }));

        return new ivm.ExternalCopy(data).copyInto();
    },
    dumpTags: async _ => {
        const data = await getClient().tagManager.dump();
        return new ivm.ExternalCopy(data).copyInto();
    },
    fetchTag: async name => {
        let tag = await getClient().tagManager.fetch(name);

        if (!tag) {
            return undefined;
        }

        if (tag.hops.length > 1) {
            tag = await getClient().tagManager.fetchAlias(tag);
        }

        return new ivm.ExternalCopy(tag).copyInto();
    },
    fetchMessage: async (user_id, ch_id, msg_id) => {
        let data = await getClient().fetchMessage(ch_id, msg_id, user_id);

        if (data === false) {
            return undefined;
        }

        data = VMUtil.removeCircRef(data);
        return new ivm.ExternalCopy(data).copyInto();
    },
    fetchMessages: async (user_id, ch_id, options) => {
        let data = await getClient().fetchMessages(ch_id, options, user_id);

        if (data === false) {
            return undefined;
        }

        data = data.map(x => VMUtil.removeCircRef(x));
        return new ivm.ExternalCopy(data).copyInto();
    }
};

export default FakeUtil;
