const osmtogeojson = require('osmtogeojson');
module.exports = () => {
    return {
        call: async function ({ params, action }) {
            const type = ["building", "highway"]
            const [lon, lat] = params.coords;
            const query = `
                [out:json][timeout:${params.timeout}];
                (
                    way["highway"](around:${params.radius}, ${lat}, ${lon});
                    relation["highway"](around:${params.radius}, ${lat}, ${lon});
                );
                out geom;
            `;
            const res = await fetch(action, {
                method: "POST",
                headers: {
                    "content-type": "application/x-www-form-urlencoded"
                },
                body: `data=${encodeURIComponent(query)}`
            })
            const featureCollection = osmtogeojson(await res.json());
            return {
                features: featureCollection.features.map(el => {
                    const fields = ["addr:street", "addr:housenumber"]
                    return {
                        id: el.id,
                        // id: el.id.replace(/\D/g, ''),
                        // name: fields.map(key => el.properties[key]).filter(Boolean).join(', ') || "Какое то местечко",
                        geometry: el.geometry,
                    }
                }),
                total: featureCollection.features.length
            }
        }
    }
}