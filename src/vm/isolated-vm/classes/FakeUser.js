class FakeUser {
    constructor(user) {
        this.user = user;

        if (typeof user === "undefined") {
            this.fixedUser = {};
            return this;
        }

        this.fakeUser = {
            guildId: user.guild.id,
            joinedTimestamp: user.joinedTimestamp,
            premiumSinceTimestamp: user.premiumSinceTimestamp,
            nickname: user.nickname,
            pending: user.pending,
            communicationDisabledUntilTimestamp: user.communicationDisabledUntilTimestamp,
            userId: user.user.id,
            avatar: user.user.avatar,
            displayName: user.displayName,
            roles: user._roles,
            avatarURL: user.user.avatarURL(),
            displayAvatarURL: user.user.displayAvatarURL(),
            id: user.user.id,
            bot: user.bot,
            system: user.system,
            flags: user.flags,
            username: user.user.username,
            discriminator: user.user.discriminator,
            banner: user.user.banner,
            accentColor: user.user.accentColor,
            createdTimestamp: user.user.createdTimestamp,
            defaultAvatarURL: user.user.defaultAvatarURL,
            hexAccentColor: user.user.hexAccentColor,
            tag: user.user.tag
        };
    }
}

export default FakeUser;
