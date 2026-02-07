module.exports = () => {
    const wellknown = require('wellknown');
    return {
        get: async function ({ params, action }) {
            let page = 1;
            const max_page = 5;
            const not_elements = ["киоск", "обьект", "туалет"]
            let object = { items: [], total: 0 };
            let current_params = {
                ...params,
                page,
            }
            while (page <= max_page) {
                const urlencoded = new URLSearchParams()
                for (const [key, value] of Object.entries(current_params)) {
                    urlencoded.append(key, value)
                }
                const res = await fetch(
                    `${action}?${urlencoded}`
                );
                const data = await res.json();
                for (const el of data.result.items) {
                    const skipped = not_elements.some(term => {
                        if (!term) return false;
                        return el.address_name.toLowerCase().includes(term.toLowerCase());
                    });
                    if (skipped) {
                        continue;
                    }
                    object.items.push({
                        id: el.id,
                        type: "Feature",
                        properties: {
                            name: el.address_name || "Какое то местечко",
                        },
                        geometry: wellknown.parse(params.type == "building" ? el.geometry.hover : el.geometry.selection),
                    })
                }
                object.total = data.result.total;
                page++;
            }
            return {
                features: object.items,
                total: object.total,
            };
        },
    }
}