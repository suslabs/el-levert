class User {
    constructor(raw, client) {
        this._raw = raw;
        this._client = client;

        this.id = raw?.id ?? raw?._id;
        this.username = raw?.username ?? "unknown";
        this.displayName = raw?.displayName ?? this.username;

        this.user = this;
    }

    displayAvatarURL() {
        return this._raw?.avatarURL ?? this._raw?.animatedAvatarURL ?? this._raw?.avatar?.createFileURL?.() ?? "";
    }
}

export { User };

