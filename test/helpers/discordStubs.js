function defaultReplyValue(data) {
    const content = typeof data === "string" ? data : (data?.content ?? "");

    return Promise.resolve({
        id: "reply-1",
        content,
        embeds: data?.embeds ?? [],
        files: data?.files ?? [],
        edit: async next => defaultReplyValue(next),
        delete: async () => undefined
    });
}

function createDiscordUser(overrides = {}) {
    const id = overrides.id ?? "user-1",
        username = overrides.username ?? "alex";

    return {
        id,
        username,
        bot: false,
        system: false,
        flags: {
            bitfield: 0
        },
        discriminator: "0001",
        avatar: null,
        banner: null,
        accentColor: null,
        createdTimestamp: Date.now(),
        defaultAvatarURL: "",
        hexAccentColor: null,
        tag: `${username}#0001`,
        globalName: username,
        avatarURL: () => "",
        displayAvatarURL: () => "",
        bannerURL: () => "",
        send: async data => defaultReplyValue(data),
        ...overrides
    };
}

function createDiscordChannel(overrides = {}) {
    return {
        id: "channel-1",
        name: "general",
        type: 0,
        flags: {
            bitfield: 0
        },
        messages: {
            cache: {
                last: () => [{ id: "current" }, { id: "previous" }]
            }
        },
        isDMBased: () => false,
        sendTyping: async () => undefined,
        send: async data => defaultReplyValue(data),
        ...overrides
    };
}

function createDiscordMessage(content, overrides = {}) {
    const channel = overrides.channel ?? createDiscordChannel(),
        author = overrides.author ?? createDiscordUser();

    return {
        id: "msg-1",
        content,
        channelId: channel.id,
        guildId: null,
        createdTimestamp: Date.now(),
        editedTimestamp: null,
        type: 0,
        system: false,
        pinned: false,
        tts: false,
        nonce: null,
        embeds: [],
        components: [],
        attachments: new Map(),
        stickers: new Map(),
        mentions: {
            everyone: false,
            users: new Map(),
            roles: new Map(),
            crosspostedChannels: new Map(),
            repliedUser: null,
            members: new Map(),
            channels: new Map()
        },
        position: 0,
        roleSubscriptionData: null,
        webhookId: null,
        groupActivityApplicationId: null,
        applicationId: null,
        activity: null,
        flags: {
            bitfield: 0
        },
        reference: null,
        interaction: null,
        author,
        channel,
        reply: async data => defaultReplyValue(data),
        edit: async data => defaultReplyValue(data),
        react: async () => undefined,
        delete: async () => undefined,
        ...overrides
    };
}

export { createDiscordChannel, createDiscordMessage, createDiscordUser, defaultReplyValue };
