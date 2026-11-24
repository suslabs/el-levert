import BaseConfigLoader from "./BaseConfigLoader.js";

class QuestbooksLoader extends BaseConfigLoader {
    constructor(logger, options) {
        super("questbooks", logger, options);
    }
}

export default QuestbooksLoader;
