## Script tags and execute_javascript

Script tags and `execute_javascript` run plain JavaScript (or TypeScript in `ts` tags) in an isolated V8 sandbox, not Node.js. There is no `require`, `import`, `process`, `fs`, `fetch` or `Buffer`. Code runs as a script, not a function body: the value of the last expression is the output. Top-level `return` is not allowed.

The sandbox has a CPU time limit (`util.timeLimit` ms) and a memory limit, so keep loops bounded and avoid huge allocations. Write synchronous code where possible: the sandbox helpers below block until they finish, so `await` is not needed for them.

## Output

The output is the last expression of the script:

- A string is sent as the message text.
- Numbers, booleans and bigints are converted to text, arrays are joined with ", " and objects are sent as JSON.
- `undefined`, functions and symbols produce no text.

Call `msg.reply(...)` to send a richer reply and stop the script immediately:

```js
msg.reply("text");
msg.reply("text", { embed: { description: "...", color: 0x2b2d31, fields: [{ name: "A", value: "B" }] } });
msg.reply({ content: "text", file: { name: "image.png", data: pngBytes } });
```

Embeds accept `author`, `color`, `hexColor`, `description`, `fields`, `footer`, `image`, `thumbnail`, `timestamp`, `title` and `url`. A file's `data` can be a string or a `Uint8Array`.

## Globals

- `msg`: the message that ran the script, with `content`, `author` (`id`, `username`, `displayName`), `channelId`, `guildId`, `attachments`, `embeds`, `reference` and `replyMsg` (the message it replies to, or null).
- `tag`: the running tag, with `name`, `body`, `owner` and `args` (the text after the tag name, or undefined when there is none).
- `util`: bot helpers and info: `util.version`, `util.env`, `util.timeLimit`, `util.outCharLimit` and `util.outLineLimit`, plus the functions listed under Sandbox functions.
- `http.request(config)`: makes an HTTP request and returns `{ status, statusText, headers, data }`. `config` takes `url`, `method`, `headers`, `params`, `data` and `responseType` (`"text"`, `"json"` or `"arraybuffer"`, which returns a `Uint8Array`). Requests to private networks are blocked and the number of requests per script is limited.
- `vm`: `vm.timeElapsed()` and `vm.timeRemaining()` report the CPU time budget in milliseconds.
- Timers: `setTimeout`, `setInterval`, `clearTimeout` and `clearInterval` work, and the script waits for pending timers and promises before finishing.

## Tags from scripts

- `util.fetchTag(name)` returns `{ name, body, owner, type, args }`, or null when the tag doesn't exist.
- `util.findTags(query)` returns matching tag names and `util.dumpTags()` lists every tag name.
- `util.executeTag(name, args)` runs another tag's code inside the current script (sharing its globals) and returns its output.
- `util.executeTagSafe(name, args)` runs another tag in its own sandbox and returns its output, so it can't change the current script's globals.
- `util.fetchMessage(channelId, messageId)`, `util.fetchMessages(channelId, options)`, `util.findUsers(query)` and `util.findUserById(id)` read messages and members the asking user can access.
- `util.delay(ms)` waits without using CPU time.

## Drawing images and making games

Images, animations and video are made with the CanvasKit loader tag, which loads Skia's CanvasKit (2D drawing), cycdraw, lodepng (PNG), gifenc (GIF) and h264 (MP4) from tags. A game such as snake is best made as a rendered image or GIF of its frames, because a script runs once and can't take input while it runs. Interactive games need the user to run the tag again with their move as the argument, storing state in the arguments or the previous message.

Load it at the top of the script, then use the libraries it puts in the global scope:

```js
"use strict";

if (util.env) {
    eval(util.fetchTag("canvaskitloader").body);
} else {
    util.executeTag("canvaskitloader");
}

const CanvasKitUtil = ModuleLoader.loadModuleFromTag("canvaskitutil");

const surface = CanvasKit.MakeSurface(400, 400),
    canvas = surface.getCanvas();

canvas.clear(CanvasKit.BLACK);

const paint = new CanvasKit.Paint();
paint.setAntiAlias(true);
paint.setColor(CanvasKit.Color(80, 200, 120, 1));
canvas.drawRect(CanvasKit.XYWHRect(40, 40, 120, 80), paint);
paint.delete();

msg.reply({ file: { name: "image.png", data: CanvasKitUtil.encodeSurface(surface, null, null, true) } });
```

- Set `util.loadLibrary` before loading to pick what gets loaded: `"canvaskit"` (the default), `"cycdraw"`, `"resvg"`, `"lodepng"`, `"gifenc"`, `"h264"`, `"satori"`, `"babel"`, `"dropflow"` or `"none"`. `loadLibrary(name)` loads more later.
- `ModuleLoader.loadModuleFromTag(name)` loads a CommonJS module stored in a tag and returns its exports. Helper modules: `canvaskitutil`, `ck_imageloader` (reads the image from the message, attachment or reply), `ck_cycdraw` (cycdraw's `Image` API) and `ck_gifenc` (GIF encoding).
- `Patches.patchGlobalContext({ name: value })` adds values to the global scope.
- `Benchmark.startTiming(key)`, `Benchmark.stopTiming(key)` and `Benchmark.getAll(true)` time each step.
- Call `.delete()` on CanvasKit objects (paints, paths, images, surfaces) once you're done with them to free memory.
- Rendering many large frames can run out of time or memory. Keep sizes small (a few hundred pixels) and frame counts low.

The full loader API (ModuleLoader, Benchmark, Patches, loadLibrary and the library globals) is in the CanvasKit loader reference sections.
