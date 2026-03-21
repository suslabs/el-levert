import { Client } from "./Client.js";

import { RESTJSONErrorCodes } from "./constants.js";
import { DiscordAPIError } from "./errors.js";

import Collection from "./Collection.js";

class Guild {
    constructor(raw, client) {
        this._raw = raw;
        this._client = client;

        this.id = raw?.id ?? raw?._id;
        this.name = raw?.name ?? "unknown";

        this.members = {
            fetch: this._fetchMembers.bind(this)
        };
    }

    async _fetchMembers(input, options = {}) {
        if (typeof input === "string") {
            const userId = Client._normalizeId(input);

            if (userId == null) {
                throw new DiscordAPIError("Invalid member id", RESTJSONErrorCodes.UnknownMember);
            }

            if (!options.force) {
                const cachedMember = this._client?._raw?.serverMembers?.getByKey?.({
                    server: this.id,
                    user: userId
                });

                if (cachedMember != null) {
                    return Client._wrapMember(cachedMember, this, this._client);
                }
            }

            try {
                const rawMember = await this._raw.fetchMember(userId);
                return Client._wrapMember(rawMember, this, this._client);
            } catch (err) {
                throw Client._toDiscordError(err, {
                    notFoundCode: RESTJSONErrorCodes.UnknownMember,
                    message: "Member not found"
                });
            }
        }

        const query = input?.query ?? "",
            limit = Number.isInteger(input?.limit) && input.limit > 0 ? input.limit : 50,
            queryLower = query.toLowerCase();

        let members, users;

        try {
            if (query && typeof this._raw.queryMembersExperimental === "function") {
                ({ members = [], users = [] } = await this._raw.queryMembersExperimental(query));
            } else {
                ({ members = [], users = [] } = await this._raw.fetchMembers());
            }
        } catch (err) {
            if (Client._isAccessError(err)) {
                return new Collection();
            }

            throw Client._toDiscordError(err, {
                notFoundCode: RESTJSONErrorCodes.UnknownGuild,
                message: "Guild member list fetch failed"
            });
        }

        const userMap = new Map(users.map(user => [user.id ?? user._id, user])),
            out = [];

        for (const member of members) {
            const user = userMap.get(member?._raw?.user?.id ?? member?.id?.user ?? member?.user?.id);

            let wrapped;

            if (user != null) {
                wrapped = Client._wrapMember({ ...member, user }, this, this._client);
            } else {
                wrapped = Client._wrapMember(member, this, this._client);
            }

            if (wrapped == null) {
                continue;
            }

            if (queryLower.length > 0) {
                const username = wrapped.user?.username?.toLowerCase() ?? "",
                    displayName = wrapped.user?.displayName?.toLowerCase() ?? "";

                if (!username.includes(queryLower) && !displayName.includes(queryLower)) {
                    continue;
                }
            }

            out.push(wrapped);

            if (out.length >= limit) {
                break;
            }
        }

        return Collection.fromArray(out);
    }
}

export { Guild };
