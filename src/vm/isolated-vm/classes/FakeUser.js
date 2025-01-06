class FakeUser {
    constructor(member) {
        this.member = member;

        if (typeof member === "undefined") {
            this.fixedUser = {};
            return this;
        }

        const user = member.user ?? member,
            id = user.id;

        this.member = user;

        this.fixedUser = {
            id,
            bot: user.bot,
            system: user.system,
            flags: user.flags.bitfield,
            username: user.username,
            discriminator: user.discriminator,
            avatar: user.avatar,
            banner: user.banner,
            accentColor: user.accentColor,
            createdTimestamp: user.createdTimestamp,
            defaultAvatarURL: user.defaultAvatarURL,
            hexAccentColor: user.hexAccentColor,
            tag: user.tag,
            avatarURL: user.avatarURL(),
            displayAvatarURL: user.displayAvatarURL(),
            bannerURL: user.bannerURL(),
            guildId: member.guild?.id,
            joinedTimestamp: member.joinedTimestamp,
            premiumSinceTimestamp: member.premiumSinceTimestamp,
            nickname: member.nickname,
            pending: member.pending,
            communicationDisabledUntilTimestamp: member.communicationDisabledUntilTimestamp,
            userId: id,
            displayName: member.displayName,
            globalName: user.globalName,
            roles: member._roles
        };
    }
}

export default FakeUser;
