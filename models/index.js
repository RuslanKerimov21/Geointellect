const { utils } = require("../services/index")
module.exports = {
    get_modules: async function (modules) {
        let items = [];
        const state = await utils.get_state({
            state: "modules.json",
        })
        for (const module of modules) {
            items.push({
                key: module,
                name: state[module]
            })
        }
        return items;
    },
}