const puppeteer = require('puppeteer');

const games = [
    '/games/2048/', '/games/flappy/', '/games/ludo/', '/games/multiplayer/',
    '/games/pong/', '/games/snake/', '/games/solitaire/', '/games/tetris/',
    '/games/tictactoe/', '/games/uno_game/'
];

async function scan() {
    console.log("Starting QA Scan...");
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    
    let allErrors = {};

    page.on('pageerror', err => {
        const game = page.url().split('/').pop();
        if (!allErrors[game]) allErrors[game] = [];
        allErrors[game].push(`[Uncaught Ex] ${err.toString()}`);
    });

    page.on('console', msg => {
        if (msg.type() === 'error') {
            const game = page.url().split('/').pop();
            const text = msg.text();
            
            if (!allErrors[game]) allErrors[game] = [];
            allErrors[game].push(`[Console Error] ${text}`);
        }
    });

    page.on('requestfailed', request => {
        const game = page.url().split('/').pop();
        const url = request.url();

        if (!allErrors[game]) allErrors[game] = [];
        allErrors[game].push(`[Network Failure] ${request.failure().errorText} ${url}`);
    });

    for (const game of games) {
        console.log(`Scanning ${game}...`);
        try {
            await page.goto(`http://localhost:8080${game}`, { waitUntil: 'networkidle2', timeout: 5000 });
            // Wait an extra second for any async init logic
            await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
            console.log(`Timeout on ${game}, but continuing...`);
        }
    }
    
    await browser.close();
    
    console.log("\n=================");
    console.log("QA SCAN RESULTS:");
    console.log("=================\n");
    if (Object.keys(allErrors).length === 0) {
        console.log("No critical errors found.");
    } else {
        for (const [game, errors] of Object.entries(allErrors)) {
            console.log(`\n--- ${game} ---`);
            errors.forEach(e => console.log(e));
        }
    }
}

scan().catch(console.error);
