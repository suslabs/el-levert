import PackSource from "./PackSource.js";

import Util from "../../util/Util.js";
import ObjectUtil from "../../util/ObjectUtil.js";
import { isSuccessStatus } from "../../util/misc/HttpStatusCodes.js";

import AIError from "../../errors/AIError.js";

class NomiCodexClient extends PackSource {
    static renderWait = 8;

    static notFoundError = "not found";

    constructor(http, options) {
        options = ObjectUtil.guaranteeObject(options);
        super(http, options);

        this.searchUrls = options.searchUrls;
        this.shotUrl = options.shotUrl;
    }

    async search(query, options) {
        options = ObjectUtil.guaranteeObject(options);

        const mode = options.mode ?? this.mode,
            uses = options.uses ?? false;

        const timeout = options.timeout ?? 0;

        const params = { q: query, mode };

        if (uses) {
            params.uses = 1;
        }

        for (const url of this.searchUrls) {
            const data = await this._fetchSearch(url, params, timeout);

            if (data !== null) {
                return data;
            }
        }

        throw new AIError("The recipe search is unavailable right now");
    }

    async renderCard(itemId, idx, options) {
        options = ObjectUtil.guaranteeObject(options);

        const mode = options.mode ?? this.mode;

        const timeout = options.timeout ?? 0;

        const res = await this.http.request({
            url: this.shotUrl,
            params: {
                item: itemId,
                mode,
                r: idx + 1,
                sel: "card",
                format: "json",
                wait: NomiCodexClient.renderWait
            },
            responseType: "json",
            timeout
        });

        if (!Util.nonemptyString(res.data.abs)) {
            throw new AIError("Couldn't render the recipe card");
        }

        return res.data.abs;
    }

    async _fetchSearch(url, params, timeout) {
        try {
            const res = await this.http.request({
                url,
                params,
                responseType: "json",
                timeout,
                validateStatus: () => true
            });

            return isSuccessStatus(res.status) ? res.data : null;
        } catch {
            return null;
        }
    }
}

export default NomiCodexClient;
