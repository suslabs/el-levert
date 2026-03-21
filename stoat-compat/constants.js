const RESTJSONErrorCodes = {
    UnknownGuild: "UnknownGuild",
    UnknownMember: "UnknownMember",
    UnknownChannel: "UnknownChannel",
    MissingAccess: "MissingAccess",
    UnknownMessage: "UnknownMessage",
    UnknownUser: "UnknownUser",
    CannotSendAnEmptyMessage: "CannotSendAnEmptyMessage",
    InvalidFormBodyOrContentType: "InvalidFormBodyOrContentType",
    CannotSendMessagesInNonTextChannel: "CannotSendMessagesInNonTextChannel",
    InvalidWebhookToken: "InvalidWebhookToken",
    UnknownWebhook: "UnknownWebhook"
};

const GatewayIntentBits = {
    Guilds: 1,
    GuildMessages: 2,
    MessageContent: 4,
    GuildMembers: 8,
    GuildInvites: 16,
    DirectMessages: 32
};

const Partials = {
    Channel: 1
};

const ActivityType = {
    0: "Playing",
    1: "Streaming",
    2: "Listening",
    3: "Watching",
    4: "Custom",
    5: "Competing",

    Playing: 0,
    Streaming: 1,
    Listening: 2,
    Watching: 3,
    Custom: 4,
    Competing: 5
};

const ChannelType = {
    DM: "DM",
    GuildText: "GuildText",
    PublicThread: "PublicThread",
    PrivateThread: "PrivateThread"
};

const MessageType = {
    Default: 0,
    Reply: 1
};

const Events = {
    ClientReady: "ready",
    MessageCreate: "messageCreate",
    MessageUpdate: "messageUpdate",
    MessageDelete: "messageDelete",
    Error: "error"
};

export {
    RESTJSONErrorCodes,
    GatewayIntentBits,
    Partials,
    ActivityType,
    ChannelType,
    MessageType,
    Events
};
