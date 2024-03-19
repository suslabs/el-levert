import { getClient, getLogger } from "../LevertClient.js";

export default {
    name: "ready",
    once: true,
    listener: _ => {
        getClient().loggedIn = true;
        getLogger().info(`The bot is online. Logged in as "${getClient().client.user.username}".`);
    }
};
