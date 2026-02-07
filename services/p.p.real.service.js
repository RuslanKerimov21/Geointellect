let global = {};
const path = require("path");
const { connect } = require("puppeteer-real-browser");
module.exports = async ({ headless }) => {
    async function create_session() {
        const { browser } = await connect({
            headless: headless,
            connectOption: {
                defaultViewport: null,
            },
            customConfig: {
                userDataDir: path.join(process.cwd(), "profile.2"),
            },
            args: [
                `--profile-directory=Default`,
                '--start-maximized',
                '--no-sandbox',
            ],
        })
        return { browser };
    }
    async function open_page() {
        try {
            const page = await global.session.browser.newPage();
            await page.goto("https://web.geointellect.com", {
                waitUntil: "networkidle0"
            })
            return page;
        }
        catch (error) {
            throw new Error(error.message);
        }
    }
    async function auth() {
        const title = await global.page.title();
        if (title.includes("H")) {
            await global.page.waitForSelector(".input-look", {
                visible: true,
            })
            const fields = await global.page.$$(".input-look");
            for (const field of fields) {
                const elem = await field.evaluate(el => {
                    return {
                        type: el.type || 'text',
                    };
                });
                switch (elem.type) {
                    case "text":
                        await field.type(process.env.GEO_INTELLECT_EMAIL);
                        break;
                    case "password":
                        await field.type(process.env.GEO_INTELLECT_PASS);
                        break
                }
                await global.page.click("button[type='button']", {
                    visible: true,
                })
            }
            await global.page.waitForNavigation({
                waitUntil: "networkidle0",
            })
        }
    }
    if (!global.session || !global.page) {
        global["session"] = await create_session();
        global["page"] = await open_page();
        await auth();
    }
    return {
        call: async function ({ action, params }) {
            try {
                const res = await global.page.evaluate(async (action, params) => {
                    if (typeof window.DoWebApiCall == "function") {
                        return await window.DoWebApiCall(action, params)
                    }
                    throw new Error('DoWebApiCall не найдена');
                }, action, params, { timeout: 1000 })
                return res;
            }
            catch (error) {
                throw new Error(error.message);
            }
        },
        auth: auth,
    }
}