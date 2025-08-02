const puppeteer = require('puppeteer');

const APP_URL = 'http://localhost:3000/practice_test.html';
const USERNAME = 'testingpuppeteer';
const PASSWORD = 'testingpuppeteer';
const HEADLESS = false;
const CLICK_DELAY = 50;
// -------------------------

const delay = ms => new Promise(res => setTimeout(res, ms));

async function runTests() {
    console.log('Starting Automated Quiz Runner...');
    const browser = await puppeteer.launch({ headless: HEADLESS });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    try {
        console.log(`Logging in as ${USERNAME}...`);
        await page.goto(APP_URL, { waitUntil: 'networkidle0' });
        await page.waitForSelector('#username');
        await page.type('#username', USERNAME);
        await page.type('#password', PASSWORD);
        await page.click('#login-button');
        await page.waitForSelector('#menu-items .menu-item');
        console.log('Login Successful.');

        const numSections = await page.evaluate(() => {
            return document.querySelectorAll('#menu-items .menu-item').length;
        });
        console.log(`Found ${numSections} quiz sections to test.`);

        for (let i = 0; i < numSections; i++) {
            console.log(`\n--- Starting Section ${i + 1} ---`);
            
            await page.evaluate((index) => {
                 document.querySelectorAll('#menu-items .menu-item')[index].click();
            }, i);

            await page.waitForSelector('#quiz');

            let questionCounter = 0;
            while (true) { 
                questionCounter++;
                await page.waitForSelector('#progress');
                const progressText = await page.$eval('#progress', el => el.textContent);
                console.log(`  - Answering... ${progressText}`);

                await page.waitForSelector('.option-letter:not([disabled])');
                await page.click('.option-letter');
                await delay(CLICK_DELAY);
                await page.click('#submit');
                
                const endOfQuestionElement = await Promise.race([
                    page.waitForSelector('#next', { visible: true }),
                    page.waitForSelector('#back-to-menu', { visible: true }),
                ]);
                
                const buttonId = await endOfQuestionElement.evaluate(el => el.id);

                if (buttonId === 'next') {
                    await page.click('#next');
                } else if (buttonId === 'back-to-menu') {
                    console.log('Section finished.');
                    await page.click('#back-to-menu');
                    await page.waitForSelector('#menu-items .menu-item');
                    break;
                }
            }
        }

        console.log('\nAll sections completed successfully!');

    } catch (error) {
        console.error('\nTEST FAILED!', error);
        console.log('The test failed. This could mean the UI got stuck, which might indicate the bug was reproduced. Check the last console message and the browser window (if not headless) to see where it stopped.');
    } finally {
        await browser.close();
    }
}

runTests();