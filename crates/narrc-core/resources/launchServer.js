// Workaround that gives Playwright the ability to use the `launchServer` API with
// Camoufox, without having to install the Node.js Playwright library.
//
// This reads launch options (as a base64-encoded JSON) from stdin, and then
// launches a Playwright server that can be connected to via Playwright's
// `connect` API.

const { randomUUID } = require('crypto');

const readline = require('readline');

let driverDir = process.argv[2];
if (!driverDir) {
    console.error('Missing driver directory argument');
    process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin });

// Read exactly one line from stdin.
let line = null;
rl.on('line', (l) => { line = l; rl.close(); });

// Wait for the first line.
rl.on('close', () => {
    if (line === null) {
        console.error('No launch options provided');
        process.exit(1);
    }

    const opts = JSON.parse(Buffer.from(line, 'base64').toString('utf-8'));

    // Fix: Playwright's launchServer rejects `--profile <dir>` in args and requires `_userDataDir`.
    // If `--profile` is present in args, extract the directory and map to `_userDataDir`.
    if (Array.isArray(opts.args)) {
        const cleanArgs = [];
        for (let i = 0; i < opts.args.length; i++) {
            if (opts.args[i] === '--profile' && i + 1 < opts.args.length) {
                opts._userDataDir = opts.args[i + 1];
                i++; // Skip the profile path value
            } else if (typeof opts.args[i] === 'string' && opts.args[i].startsWith('--profile=')) {
                opts._userDataDir = opts.args[i].slice('--profile='.length);
            } else if (opts.args[i] !== '-silent' && opts.args[i] !== '--silent') {
                cleanArgs.push(opts.args[i]);
            }
        }
        opts.args = cleanArgs;
    }

    // Share pre-launched browser persistent context to guarantee exactly ONE window
    opts._sharedBrowser = true;

    // `addInitScript` and `options` are not launch options, they are passed to the
    // browser context.
    let initScript = opts.addInitScript;
    delete opts.addInitScript;
    let contextOptions = opts.options;
    delete opts.options;

    const playwright = require(driverDir);
    const { firefox } = playwright;
    // Start the server.
    firefox.launchServer(opts).then((server) => {
        // Get the WebSocket endpoint
        const wsEndpoint = server.wsEndpoint();
        console.log(JSON.stringify({ wsEndpoint }));

        if (initScript) {
            // This is a hack to add an init script to every page, since Playwright
            // doesn't support this on launchServer (contexts created via connect()
            // can't use addInitScript reliably).
            //
            // ...
        }

        // Close the server when stdin closes.
        //
        // The upstream Playwright `launchServer` API doesn't close when the parent
        // process exits, so we need to keep stdin open and close it manually when
        // the parent dies. This is handled by the Python lib.
        //
        // When stdin closes, we close the server.
        process.stdin.on('end', () => {
            server.close();
        });
        process.stdin.on('close', () => {
            server.close();
        });
    }).catch((e) => {
        console.error(e);
        process.exit(1);
    });
});

console.error(`[camoufox] Using Playwright driver at: ${driverDir}`);
console.error(`[camoufox] Waiting for launch options on stdin...`);
