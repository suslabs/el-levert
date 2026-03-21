import { Client } from "./Client.js";

class GuildMember {
    constructor(raw, guild, client) {
        this._raw = raw;
        this._client = client;

        this.guild = guild;

        this.user = Client._wrapUser(raw?.user ?? raw, client);

        this.id = this.user?.id;
        this.username = this.user?.username;
        this.displayName = this.user?.displayName;
        this.nickname = raw?.nickname ?? raw?.nick ?? null;
    }
}

export { GuildMember };

