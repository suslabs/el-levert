import { Client } from "./Client.js";
import { WebhookClient } from "./WebhookClient.js";

import { Guild } from "./Guild.js";
import { BaseChannel } from "./BaseChannel.js";
import { User } from "./User.js";
import { GuildMember } from "./GuildMember.js";
import { Message } from "./Message.js";

import { DiscordAPIError } from "./errors.js";
import { PermissionsBitField } from "./PermissionsBitField.js";

import * as constants from "./constants.js";
import * as builders from "./builders.js";
import * as formatters from "./formatters.js";

import Collection from "./Collection.js";

const discord = {
    Client,
    WebhookClient,

    Guild,
    BaseChannel,
    User,
    GuildMember,
    Message,

    DiscordAPIError,
    PermissionsBitField,

    ...constants,
    ...builders,
    ...formatters,

    Collection
};

export default discord;

export { Client } from "./Client.js";
export { WebhookClient } from "./WebhookClient.js";

export { Guild } from "./Guild.js";
export { BaseChannel } from "./BaseChannel.js";
export { User } from "./User.js";
export { GuildMember } from "./GuildMember.js";
export { Message } from "./Message.js";

export { DiscordAPIError } from "./errors.js";
export { PermissionsBitField } from "./PermissionsBitField.js";

export * from "./constants.js";
export * from "./builders.js";
export * from "./formatters.js";

export { default as Collection } from "./Collection.js";
