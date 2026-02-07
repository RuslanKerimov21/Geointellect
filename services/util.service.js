const fs = require("fs").promises;
const lodash = require("lodash");
const path = require("path");
module.exports = () => {
    return {
        api: {
            get: async function ({ name, services }) {
                return {
                    call: services[name],
                }
            },
        },
        state: {
            get: async function ({ state }) {
                const data = await fs.readFile(path.join(process.cwd(), "data", state), "utf-8");
                return JSON.parse(data);
            },
            create: async function ({ name, buffer }) {
                fs.writeFile(path.join(process.cwd(), "docs", name), buffer);
                return path.join(process.cwd(), "docs", name)
            },
            update: async function (state, update, file) {
                let updated;
                updated = lodash.merge({}, state, update);
                await fs.writeFile(path.join(process.cwd(), "data", file), JSON.stringify(updated, null, 2), "utf8");
                return updated;
            }
        },
    }
}