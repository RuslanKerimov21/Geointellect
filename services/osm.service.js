const osmtogeojson = require('osmtogeojson');
module.exports = () => {
    return {
        get_data: async function ({ params, action }) {
            const [lon, lat] = params.coords;
            const query = `
                [out:json][timeout:${params.timeout}];
                nwr["${params.type}"](around:${params.radius}, ${lat}, ${lon});
                out geom;
            `;
            const res = await fetch(action, {
                method: "POST",
                headers: {
                    "content-type": "application/x-www-form-urlencoded"
                },
                body: `data=${encodeURIComponent(query)}`
            })
            return res.ok ? osmtogeojson(await res.json()) : null;
        }
    }
}