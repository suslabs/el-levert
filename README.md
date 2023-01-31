# EL LEVERT JR
Romanian version of Leveret by Neeve. Includes many Romaniations such as "stealing", "cabal", "g" and "Jhon".

# Config
`config/auth.json` must exist and contain the following lines:

    {
        "token": "bot token",
        "selfbotToken": "account token (for previewing other servers)"
    }

`config/config.json` must have the property `owner` set to your own Discord id.
`config/reactions.json` must contain at least `"enableReacts": false`. If `enableReacts` is set to true, the file must have the following structure:

    {
        "enableReacts": true,
        "parans": {
            "left": [left paranthesis emoji ids],
            "right": [right paranthesis emoji ids]
        },
        "funnyWords": [
            {
                "words": "word" or ["word1", "word2"],
                "react": "emoji" or ["emoji1", "emoji2"]
            },
            ...
        ]
    }

# Startup
If running for the first time run `npm install` and hope isolated-vm decides to actually install without 50 errors (rare occurrence).
To start the bot, navigate to the root directory and run `npm start`. Logs will be printed both to the console and to files in the `logs` folder.

# Importing
To download the tag database from the original bot run `%eval JSON.stringify(util.dumpTags().map(x => util.fetchTag(x)))` and download the resulting file. To import these tags, navigate to the root directory and run `node ./database/importer/importer.js -i path-to-tags`.

To delete all imported tags run `node ./database/importer/importer.js --p1`.

