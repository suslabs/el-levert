import { RESTJSONErrorCodes } from "discord.js";

const ErrorCodes = Object.freeze({
    channelInaccessible: [RESTJSONErrorCodes.UnknownChannel, RESTJSONErrorCodes.MissingAccess],
    guildInaccessible: [RESTJSONErrorCodes.UnknownGuild, RESTJSONErrorCodes.MissingAccess],
    messageInaccessible: [RESTJSONErrorCodes.UnknownMessage, RESTJSONErrorCodes.MissingAccess],
    userInaccessible: [RESTJSONErrorCodes.UnknownUser, RESTJSONErrorCodes.MissingAccess],
    webhookInaccessible: [RESTJSONErrorCodes.UnknownWebhook, RESTJSONErrorCodes.InvalidWebhookToken],

    unknownChannel: [RESTJSONErrorCodes.UnknownChannel],
    unknownGuild: [RESTJSONErrorCodes.UnknownGuild],
    unknownMember: [RESTJSONErrorCodes.UnknownMember],
    unknownMessage: [RESTJSONErrorCodes.UnknownMessage],
    unknownUser: [RESTJSONErrorCodes.UnknownUser],
    unknownWebhook: [RESTJSONErrorCodes.UnknownWebhook],

    missingAccess: [RESTJSONErrorCodes.MissingAccess],
    invalidWebhookToken: [RESTJSONErrorCodes.InvalidWebhookToken],
    invalidFormBody: [RESTJSONErrorCodes.InvalidFormBodyOrContentType],

    emptyMessage: [RESTJSONErrorCodes.CannotSendAnEmptyMessage],
    nonTextChannel: [RESTJSONErrorCodes.CannotSendMessagesInNonTextChannel]
});

function isErrorCode(category, code) {
    code = code?.code ?? code;
    return ErrorCodes[category]?.includes(code) ?? false;
}

export { ErrorCodes, isErrorCode };
