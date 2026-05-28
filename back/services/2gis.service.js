module.exports = () => {
    const wellknown = require('wellknown');
    return {
        call: async function ({ params, action }) {
            let page = 1;
            const max_page = 5;
            let object = { items: [], total: 0 };
            try {
                while (page <= max_page) {
                    let current_params = {
                        ...params,
                        page,
                    }
                    const urlencoded = new URLSearchParams()
                    for (const [key, value] of Object.entries(current_params)) {
                        urlencoded.append(key, value)
                    }
                    const res = await fetch(
                        `${action}?${urlencoded}`
                    );
                    if (!res.ok) {
                        break;
                    }
                    const data = await res.json();
                    for (const el of data.result.items) {
                        object.items.push({
                            id: el.id,
                            name: el.address_name || "Какое то местечко",
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
            }
            catch (error) {
                console.log(error.message)
                throw error;
            }
        }
    }
}