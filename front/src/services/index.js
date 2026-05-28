export const services = {
    call: async function ({ action, method, params }) {
        const api = {
            items: {
                method: {
                    call: async (params, method) => {
                        try {
                            const res = await fetch(`${process.env.REACT_APP_API_URL}items/${method}`, {
                                method: "POST",
                                headers: {
                                    "content-type": "application/json",
                                },
                                body: JSON.stringify(params || null)
                            })
                            return res.ok ? await res.json() : null;
                        }
                        catch (error) {
                            throw new Error(error);
                        }
                    },
                    create: async (params, method) => {
                        try {
                            const res = await fetch(`${process.env.REACT_APP_API_URL}items/${method}/osm`, {
                                method: "POST",
                                headers: {
                                    "content-type": "application/json",
                                },
                                body: JSON.stringify(params)
                            })
                            return res.ok ? await res.json() : null;
                        }
                        catch (error) {
                            throw error;
                        }
                    },
                    update: async (params, method) => {
                        try {
                            const res = await fetch(`${process.env.REACT_APP_API_URL}items/${method}`, {
                                method: "POST",
                                headers: {
                                    "content-type": "application/json",
                                },
                                body: JSON.stringify(params)
                            })
                            return res.ok ? await res.json() : null;
                        }
                        catch (error) {
                            throw error;
                        }
                    },
                    append: async (_, method) => {
                        try {
                            const res = await fetch(`${process.env.REACT_APP_API_URL}items/${method}`, {
                                method: "POST",
                                headers: {
                                    "content-type": "application/json",
                                },
                            })
                            return res.ok ? await res.json() : null;
                        }
                        catch (error) {
                            throw error;
                        }
                    },
                    get: async function (params, method) {
                        try {
                            const urlencoded = new URLSearchParams();
                            for (const [key, value] of Object.entries(params)) {
                                urlencoded.append(key, value)
                            }
                            const res = await fetch(`${process.env.REACT_APP_API_URL}items?${urlencoded.toString()}`, {
                                method: method,
                                headers: {
                                    "authorization": "Bearer 3d052b96-3eaa-4c19-a049-146ca2e41491"
                                }
                            })
                            return res.ok ? await res.json() : null;
                        }
                        catch (error) {
                            throw error;
                        }
                    }
                }
            },
            storage: {
                method: {
                    set: function (params) {
                        for (const [key, value] of Object.entries(params)) {
                            localStorage.setItem(key, value)
                            return localStorage.getItem(key) ? JSON.parse(localStorage.getItem(key)) : null;
                        }
                    },
                    get: function (params) {
                        for (const value of Object.values(params)) {
                            const data = localStorage.getItem(value)
                            return data ? JSON.parse(data) : null;
                        }
                    }
                }
            },
            encryption: {
                method: {
                    cesar: function (params) {
                        const raw = [];
                        const ABC = ["А", "B", "C", "D", "I", "F"];
                        for (const len of params.text.split("")) {
                            console.log(len)
                        }
                    }
                }
            }
        }
        for (const value of Object.values(api[action])) {
            return await value[method](params, method)
        }
    },
}

// const createGeoms = useCallback(async (terra, id) => {
//     try {
//         const wkt = new Wkt.Wkt();
//         const bounds = getBounds();
//         const geoJson = terra.getSnapshotFeature(id);
//         const res = await fetch(`${process.env.REACT_APP_API_URL}items/create`, {
//             method: "POST",
//             headers: {
//                 "content-type": "application/json"
//             },
//             body: JSON.stringify({
//                 key: process.env.REACT_APP_2GIS_KEY,
//                 wkt: (() => {
//                     wkt.fromObject(geoJson.geometry);
//                     return wkt.write()
//                 })(),
//             })
//         })
//         if (res.ok) {
//             for (const layer of layersRef.current) {
//                 const res = await SERVICES.call({
//                     method: "get",
//                     action: "items",
//                     params: { bounds, type: layer }
//                 })
//                 geoJsonSourceRef.current[layer].setData({
//                     type: "FeatureCollection",
//                     features: res.features || [],
//                 });
//             }
//         }
//     }
//     catch (error) {
//         console.log(error.message)
//     }
// }, [])