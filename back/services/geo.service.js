let global = {};
const path = require("path");
const { connect } = require("puppeteer-real-browser");
module.exports = async ({ headless, url }) => {
    async function createSession() {
        const { browser } = await connect({
            headless: headless,
            connectOption: {
                defaultViewport: null,
            },
            customConfig: {
                userDataDir: path.join(process.cwd(), "profiles", "profile.d"),
            },
            args: [
                `--profile-directory=Default`,
                '--start-maximized',
                '--no-sandbox',
            ],
        })
        return { browser };
    }
    async function openPage() {
        try {
            const page = await global.session.browser.newPage();
            await page.goto(url, {
                waitUntil: "networkidle0"
            })
            return page;
        }
        catch (error) {
            throw new Error(error.message);
        }
    }
    async function authPage() {
        const title = await global.page.title();
        if (title.includes("Вход") || title.includes("H")) {
            await global.page.waitForSelector(".input-look", {
                visible: true,
            })
            const fields = await global.page.$$(".input-look");
            for (const field of fields) {
                const elem = await field.evaluate(el => {
                    return {
                        value: el.value,
                        type: el.type || 'text',
                    };
                });
                console.log(elem)
                if (elem.value && elem.value.length > 0) {
                    continue;
                }
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
        global["session"] = await createSession();
        global["page"] = await openPage();
        await authPage();
    }
    return {
        call: async function ({ action, params }) {
            try {
                const res = await global.page.evaluate(async (action, params) => {
                    if (typeof window.DoWebApiCall == "function") {
                        return await window.DoWebApiCall(action, params)
                    }
                    throw new Error('DoWebApiCall не найдена');
                }, action, params, { timeout: 2000 })
                return res;
            }
            catch (error) {
                throw error;
            }
        },
        authPage,
    }
}