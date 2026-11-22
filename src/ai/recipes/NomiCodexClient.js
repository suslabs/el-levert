import Util from "../../util/Util.js";
import { isSuccessStatus } from "../../util/misc/HttpStatusCodes.js";

import AIError from "../../errors/AIError.js";

class NomiCodexClient {
    static renderWait = 8;

    constructor(http, options) {
        this.http = http;

        this.searchUrls = options.searchUrls;
        this.shotUrl = options.shotUrl;
        this.siteUrl = options.siteUrl;

        this.mode = options.mode;
    }

    getMode(expert) {
        return expert ? "expert" : this.mode;
    }

    getItemUrl(itemId) {
        return `${this.siteUrl}/?item=${encodeURIComponent(itemId)}`;
    }

    async search(query, options) {
        const params = { q: query, mode: options.mode };

        if (options.uses) {
            params.uses = 1;
        }

        for (const url of this.searchUrls) {
            const data = await this._fetchSearch(url, params, options.timeout);

            if (data !== null) {
                return data;
            }
        }

        throw new AIError("The recipe search is unavailable right now");
    }

    async renderCard(itemId, idx, options) {
        const res = await this.http.request({
            url: this.shotUrl,
            params: {
                item: itemId,
                mode: options.mode,
                r: idx + 1,
                sel: "card",
                format: "json",
                wait: NomiCodexClient.renderWait
            },
            responseType: "json",
            timeout: options.timeout
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
