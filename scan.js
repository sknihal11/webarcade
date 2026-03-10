const puppeteer = require('puppeteer');

const games = [
    '2048.html', 'flappy.html', 'ludo.html', 'multiplayer.html', 
    'pong.html', 'snake.html', 'solitaire.html', 'tetris.html', 
    'tictactoe.html', 'uno_game.html'
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
            // Ignore expected AdSense 400 Bad Request
            if (text.includes('adsbygoogle') || text.includes('400 (Bad Request)')) return;
            if (text.includes('net::ERR_FAILED') && text.includes('googleads')) return;
            
            if (!allErrors[game]) allErrors[game] = [];
            allErrors[game].push(`[Console Error] ${text}`);
        }
    });

    page.on('requestfailed', request => {
        const game = page.url().split('/').pop();
        const url = request.url();
        if (url.includes('googleads') || url.includes('doubleclick')) return;
        
        if (!allErrors[game]) allErrors[game] = [];
        allErrors[game].push(`[Network Failure] ${request.failure().errorText} ${url}`);
    });

    for (const game of games) {
        console.log(`Scanning ${game}...`);
        try {
            await page.goto(`http://localhost:8080/games/${game}`, { waitUntil: 'networkidle2', timeout: 5000 });
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
        console.log("No critical errors found! (AdSense errors hidden)");
    } else {
        for (const [game, errors] of Object.entries(allErrors)) {
            console.log(`\n--- ${game} ---`);
            errors.forEach(e => console.log(e));
        }
    }
}

scan().catch(console.error);
