import { TerraDraw, TerraDrawPointMode, TerraDrawPolygonMode, TerraDrawSelectMode } from "terra-draw";
import { TerraDrawMapGlAdapter } from '@2gis/mapgl-terra-draw';
import { Fragment, useEffect, useRef } from "react";
import { services } from "../../services";
import { LAYERS } from "../../constants";
import { Wrapper } from "./wrapper";
import { load } from "@2gis/mapgl";
import { ProgressBar } from "..";
export default function Map({ loading, setLoading, isDrawing, radius, layers, center, layer, setMsg }) {
    const geoJsonSourceRef = useRef({
        roads: null,
        traffic: null,
        polygons: null,
        buildings: null,
    })
    const stateRef = useRef({
        loading: false,
        layers: layers,
        radius: radius,
        center: center,
        layer: layer,
    })
    const mapRef = useRef({
        map: null,
        mapgl: null,
    });
    const drawRef = useRef(
        null
    );
    function getBounds() {
        const items = [];
        const bounds = mapRef.current.map.getBounds();
        for (const [key, value] of Object.entries(bounds)) {
            if (key == "southWest") {
                items.push(...value)
            }
        }
        for (const [key, value] of Object.entries(bounds)) {
            if (key == "northEast") {
                items.push(...value)
            }
        }
        return items;
    }
    async function init() {
        mapRef.current.mapgl = await load();
        mapRef.current.map = new mapRef.current.mapgl.Map("gl", {
            zoom: 17,
            center: center,
            zoomControl: false,
            key: "5135bce9-296b-4d9d-afaf-ffbbf4ea7d39",
        });
        mapRef.current.map.on("click", async (e) => {
            const bounds = getBounds()
            const res = await services.call({
                action: "items",
                method: "create",
                params: {
                    coords: e.lngLat,
                    extractor: "gis",
                    layer: stateRef.current.layer,
                    radius: stateRef.current.radius,
                }
            })
            setMsg(res.message)
            for (const layer of stateRef.current.layers) {
                const res = await services.call({
                    method: "get",
                    action: "items",
                    params: { bounds, layer: layer }
                })
                if (geoJsonSourceRef.current[layer] && res?.features) {
                    geoJsonSourceRef.current[layer].setData(res);
                }
            }
        });
        // mapRef.current.map.on("mousemove", async (e) => {
        //     console.log(e.targetData)
        // });
        mapRef.current.map.on("moveend", async () => {
            const bounds = getBounds();
            const center = mapRef.current.map.getCenter();
            for (const layer of stateRef.current.layers) {
                const res = await services.call({
                    method: "get",
                    action: "items",
                    params: { bounds, layer: layer }
                })
                geoJsonSourceRef.current[layer].setData(res);
            }
            await services.call({
                action: "storage",
                method: "set",
                params: {
                    coords: JSON.stringify(center)
                }
            });
        });
        mapRef.current.map.on("zoomend", async () => {
            const bounds = getBounds();
            for (const layer of stateRef.current.layers) {
                const res = await services.call({
                    method: "get",
                    action: "items",
                    params: { bounds, layer: layer }
                })
                geoJsonSourceRef.current[layer].setData(res);
            }
        });
        mapRef.current.map.on("styleload", async () => {
            const bounds = getBounds();
            for (const layer of LAYERS) {
                geoJsonSourceRef.current[layer.id] = new mapRef.current.mapgl.GeoJsonSource(mapRef.current.map, {
                    data: { type: "FeatureCollection", features: [] },
                    attributes: { bar: layer.id },
                });
            }
            for (const layer of LAYERS) {
                mapRef.current.map.addLayer(layer);
            }
            for (const layer of stateRef.current.layers) {
                const res = await services.call({
                    method: "get",
                    action: "items",
                    params: { bounds, layer: layer }
                });
                geoJsonSourceRef.current[layer].setData(res);
            }
            setLoading(false);
        });
        return () => mapRef.current.map && mapRef.current.map.destroy();
    }
    function drawMode({ enabled }) {
        if (!drawRef.current) {
            drawRef.current = new TerraDraw({
                adapter: new TerraDrawMapGlAdapter({
                    map: mapRef.current.map,
                    mapgl: mapRef.current.mapgl,
                    coordinatePrecision: 9,
                }),
                modes: [
                    new TerraDrawPointMode(),
                    new TerraDrawSelectMode(),
                    new TerraDrawPolygonMode(),
                ],
            });
            drawRef.current.start();
            drawRef.current.on("finish", (id) => {
                if (drawRef.current && isDrawing) {

                }
            });
        }
        if (enabled) {
            drawRef.current.setMode("polygon");
        } else {
            drawRef.current.clear();
            drawRef.current.setMode("static");
        }
    }
    useEffect(() => {
        if (!stateRef.current.loading && center) {
            init();
            stateRef.current.loading = true;
        }
    }, [center]);
    useEffect(() => {
        if (mapRef.current.map && center) {
            mapRef.current.map.setCenter(center);
            mapRef.current.map.setZoom(20)
        }
    }, [center]);
    useEffect(() => {
        if (mapRef.current.map) {
            drawMode({ enabled: isDrawing })
        }
    }, [isDrawing])
    useEffect(() => {
        stateRef.current.layer = layer;
        stateRef.current.center = center;
        stateRef.current.radius = radius;
    }, [layer, radius, center]);
    useEffect(() => {
        if (mapRef.current.map) {
            (async () => {
                for (const layer of LAYERS) {
                    if (!layers.includes(layer.id)) {
                        geoJsonSourceRef.current[layer.id].setData({
                            type: "FeatureCollection",
                            features: [],
                        });
                    }
                }
                for (const layer of layers) {
                    const bounds = getBounds();
                    const res = await services.call({
                        method: "get",
                        action: "items",
                        params: { bounds, layer }
                    })
                    if (geoJsonSourceRef.current[layer] && res?.features) {
                        geoJsonSourceRef.current[layer].setData(res);
                    }
                }
            })()
        };
        stateRef.current.layers = layers;
    }, [layers]);
    return (
        <Fragment>
            <div style={{ width: "100%", height: "100vh" }}>
                {loading && <div className="overlay"><ProgressBar size={30} /></div>}
                <Wrapper />
            </div>
        </Fragment>
    )
}


// mapRef.current.map.on("mousemove", async (e) => {
//     const bounds = getBounds();
//     await services.call({
//         action: "items",
//         method: "create",
//         params: {
//             extractor: "gis",
//             coords: e.lngLat,
//             layer: stateRef.current.layer,
//             radius: stateRef.current.radius,
//         }
//     })
//     for (const layer of stateRef.current.layers) {
//         const res = await services.call({
//             method: "get",
//             action: "items",
//             params: { bounds, layer: layer }
//         })
//         if (geoJsonSourceRef.current[layer] && res?.features) {
//             geoJsonSourceRef.current[layer].setData(res);
//         }
//     }
// });