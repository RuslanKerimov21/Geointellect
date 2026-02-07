const app = require("express")();
const { get_modules } = require("./models");
const { pg, google, geo, tg, osm, util, gis, pp } = require("./services/index");
app.use(require("express").json());
app.use(require("cors")());
app.get("/api/items/get/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const query = `
            SELECT 
                id,
                name,
                 json_build_array(
                    ROUND(ST_X(ST_Centroid(geom))::numeric, 6), 
                    ROUND(ST_Y(ST_Centroid(geom))::numeric, 6)
                ) as coords,
                (
                    SELECT COALESCE(SUM(
                        CASE 
                            WHEN (elem->'Attributes'->>'diapazon') ~ '^[-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?$'
                            THEN (elem->'Attributes'->>'diapazon')::numeric 
                            ELSE 0 
                        END
                    ), 0)
                    FROM jsonb_array_elements(
                        CASE
                            WHEN jsonb_typeof(features) = 'array' THEN features
                            ELSE '[]'::jsonb
                        END
                    ) AS elem
                ) as total_count
            FROM buildings
            WHERE id = $1
        `;
        const [rows] = await pg.query({
            query: query,
            params: [id]
        });
        res.json(rows)
    }
    catch (error) {
        return res.status(500).json({
            message: error.message,
            error: "Ошибка на стороне сервера"
        })
    }
})
app.get("/api/items/get", async (req, res) => {
    let query;
    const authorization = req.headers.authorization;
    const [name, value] = authorization.split(" ");
    if (authorization.startsWith(name) && value.includes(process.env.TO_GIS_KEY)) {
        const { type, bounds } = req.query;
        const [west, south, east, north] = bounds.split(',').map(Number);
        switch (type) {
            case "roads": query = `
                    SELECT json_build_object(
                        'type', 'FeatureCollection',
                        'features', COALESCE(
                            json_agg(
                                json_build_object(
                                    'type', 'Feature',
                                    'id', id,
                                    'properties', json_build_object(
                                        'original_id', original_id
                                    ),
                                    'geometry', ST_AsGeoJSON(geom)::json
                                )
                            )
                        )
                    ) as geojson
                    FROM roads
                    WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326) 
                    AND geom IS NOT NULL
                    `;
                break;
            case "buildings": query = `
                    SELECT 
                        json_build_object(
                            'type', 'FeatureCollection',
                            'features', COALESCE(
                                json_agg(
                                    json_build_object(
                                        'type', 'Feature',
                                        'id', id,
                                        'properties', json_build_object(
                                            'original_id', original_id,
                                            'name', name
                                        ),
                                        'geometry', ST_AsGeoJSON(geom)::json
                                    )
                                ),
                                '[]'::json
                            )
                        ) as geojson
                    FROM buildings
                    WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326) 
                    AND geom IS NOT NULL
                    `;
                break;
            case "traffic": query = `
                    WITH building_road_connections AS (
                        SELECT 
                            unnest(b.road_ids) as road_id,
                            COUNT(DISTINCT b.id) as buildings_count
                        FROM buildings b
                        WHERE b.geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
                        AND b.road_ids IS NOT NULL
                        GROUP BY 1
                    )
                    SELECT json_build_object(
                        'type', 'FeatureCollection',
                        'features', COALESCE(
                            json_agg(
                                json_build_object(
                                    'type', 'Feature',
                                    'geometry', ST_AsGeoJSON(r.geom)::json,
                                    'properties', json_build_object(
                                        'id', r.id,
                                        'original_id', r.original_id,
                                        'connected_buildings_count', brc.buildings_count
                                    )
                                )
                            ),
                            '[]'::json
                        )
                    ) as geojson
                    FROM roads r
                    JOIN building_road_connections brc ON r.id = brc.road_id
                    WHERE r.geom && ST_MakeEnvelope($1, $2, $3, $4, 4326);
                    `;
                break;
            default:
                return res.json({ message: "Не известный тип для таблицы" });
        }
        const [items] = await pg.query({
            query: query,
            params: [west, south, east, north]
        })
        res.json(items.geojson)
    }
    else {
        res.json({
            message: "Нет доступа"
        });
    }
})

app.post("/api/items/create", async (req, res) => {
    const params = [];
    const values = [];
    const { coords, radius, type } = req.body;
    try {
        const [lon, lat] = coords;
        const { features } = await gis.get({
            params: {
                lon: lon,
                lat: lat,
                type: type.name == "roads" ? "street" : "building",
                radius, fields: "items.geometry.hover,items.geometry.selection",
            },
            action: "https://platform.2gis.ru/api/services/geocoder",
        })
        if (features.length < 1) {
            return res.json({
                message: "Не найдено результатов в заданном радиусе"
            });
        }
        const rows = await pg.query({
            query: `SELECT original_id FROM ${type.name} WHERE original_id = ANY($1)`,
            params: [features.map(el => el.id)]
        })
        const items = features.filter(el => {
            return !rows.includes(el.id);
        });
        for (const el of items) {
            const data = {};
            const placeholders = [];
            const { id, geometry, properties } = el;
            const { name } = properties;
            for (const field of type.fields) {
                switch (field) {
                    case "original_id":
                        data[field] = id;
                        break;
                    case "name":
                        data[field] = name;
                        break;
                    case "geom":
                        data[field] = geometry;
                        break;
                    case "road_ids":
                        const [items_a] = await pg.query({
                            query: `WITH building_geom AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) as geom) SELECT COALESCE(array_agg(DISTINCT r.id), '{}') as road_ids FROM roads r CROSS JOIN building_geom bg WHERE ST_DWithin(r.geom::geography, bg.geom::geography, $2);`,
                            params: [geometry, 20]
                        })
                        data[field] = items_a[field];
                        break;
                    case "roads_count":
                        const [items_b] = await pg.query({
                            query: `WITH building_geom AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) as geom) SELECT COALESCE(array_agg(DISTINCT r.id), '{}') as road_ids FROM roads r CROSS JOIN building_geom bg WHERE ST_DWithin(r.geom::geography, bg.geom::geography, $2);`,
                            params: [geometry, 20]
                        })
                        data[field] = items_b["road_ids"].length;
                        break;
                }
            }
            for (const field of type.fields) {
                const index = params.length + 1;
                switch (field) {
                    case "geom":
                        placeholders.push(`ST_SetSRID(ST_Force2D(ST_GeomFromGeoJSON($${index})), 4326)`);
                        params.push(data[field]);
                        break;
                    default:
                        placeholders.push(`$${index}`);
                        params.push(data[field]);
                }
            }
            values.push(`(${placeholders.join(', ')})`);
        }
        await pg.query({
            params: params,
            query: `INSERT INTO ${type.name} (${type.fields.join(', ')}) VALUES ${values.join(',')} RETURNING id, original_id;`
        })
        res.json({ message: "Успешно" })
    }
    catch (error) {
        return res.json({
            error: "Ошибка на стороне сервера",
            message: error.message,
        })
    }
})

app.post("/api/items/update", async (req, res) => {
    const { fields } = req.body;
    try {
        const api = await pp({ headless: true });
        let state = await util.state.get({
            state: "state.json",
        });
        let files = await google.drive.get({
            name: "расчет трафика"
        })
        let spreadsheet = await google.sheets.get({
            uid: files.at(-1).id,
        })
        while (true) {
            try {
                const update_list = new Map();
                const query = `
                    SELECT
                    id,
                    original_id,
                    name,
                    json_build_array(
                        ST_X(ST_Transform(ST_Centroid(geom), 4326)),
                        ST_Y(ST_Transform(ST_Centroid(geom), 4326))
                    ) as coords,
                    ST_AsGeoJSON(geom)::json as geometry,
                    json_build_object(
                        'Login', 'oferredsheep@gmail.com',
                        'Tooltype', 'info-polygon',
                        'Address', 'Не определено',
                        'Name', 'Не определено',
                        'Point', null,
                        'Line', null,
                        'Metadata', json_build_object(
                            'ToolName', 'Инфо в зоне',
                            'Location', json_build_object(
                                'UniverseId', 'MV298601°ΛCDM',
                                'GalaxyName', 'Milky Way',
                                'SystemName', 'Solar',
                                'PlanetName', 'Земля',
                                'CountryName', '',
                                'RegionName', '',
                                'MunicipalityName', '',
                                'LocalityName', '',
                                'AdminName', '',
                                'Address', '',
                                'StreetName', '',
                                'BuildingNumber', '',
                                'Caption', 'Не определено'
                            ),
                            'Area', COALESCE(
                                NULLIF(ABS(ST_Area(geom::geography)), 0),  -- Используем ABS и защиту от 0
                                0
                            ),
                            'Perimeter', 0,
                            'Buffer', 0,
                            'Params', json_build_object('id', id, 'original_id', original_id)
                        ),
                        'Polygon', json_build_object(
                            'type', 'Polygon',
                            'coordinates', ST_AsGeoJSON(
                                ST_Transform(
                                    ST_Buffer(
                                        CASE 
                                            WHEN ST_GeometryType(geom) = 'ST_MultiPolygon' 
                                            THEN ST_GeometryN(geom, 1)
                                            ELSE geom
                                        END::geography, 
                                        $3
                                    )::geometry,
                                    3857
                                )
                            )::json->'coordinates',
                            'crs', json_build_object(
                                'type', 'name',
                                'properties', json_build_object('name', 'EPSG:3857')
                            )
                        ),
                        'GeointellectLayers', json_build_array(
                            json_build_object(
                                'Id', 4032,
                                'Filter', '[]'::json,
                                'Name', 'Оценка пешеходного потока (МСК)(demo)',
                                'LegendItems', '[0,1,2,3,4,5,6]'::json,
                                'Opacity', 1,
                                'Index', 20
                            )
                        ),
                        'UserLayers', '[]'::json
                    ) as geodata
                    FROM buildings
                    WHERE geom IS NOT NULL
                        AND LOWER(name) NOT LIKE '%туалет%'
                        AND LOWER(name) NOT LIKE '%объект%'
                        AND LOWER(name) NOT LIKE '%обьект%'
                    LIMIT $1 OFFSET $2
                `;
                const rows = await pg.query({
                    query: query,
                    params: [state.pageSize, state.offset, 20],
                })
                const [total] = await pg.query({
                    query: `SELECT COUNT(*) as count FROM buildings;`,
                })
                if (state.offset >= total.count) {
                    const files = await google.drive.get({
                        capiton: "Расчет трафика"
                    });
                    await tg.send_file({
                        files: files,
                        users: "@MR_Grives"
                    })
                    state = await util.state.update(state, {
                        offset: 0,
                        index: 0
                    }, "state.json")
                    break;
                }
                for (let i = state.index; i < rows.length; i++) {
                    const row = rows[i];
                    const data = { id: row.id };
                    for (const field of fields) {
                        switch (field) {
                            case "features":
                                try {
                                    const objects = [];
                                    const report = await api.call({
                                        action: "LayerRequest/doRequestJson",
                                        params: { basemapid: 3, login: process.env.GEO_INTELLECT_EMAIL, content: JSON.stringify(row.geodata) }
                                    })
                                    console.log(report)
                                    if (report.message?.includes('НЕТ ДОСТУПА [key]')) {
                                        console.log("Пересоздадим сессию")
                                        await api.auth()
                                        continue;
                                    }
                                    if (report.results) {
                                        if (report.results.ReportContent.Layers.length > 0) {
                                            objects.push(...report.results.ReportContent.Layers.flatMap(l => l.Objects || []));
                                        }
                                    }
                                    if (report?.results?.Uid) {
                                        await api.call({
                                            action: "RequestHistory/Delete",
                                            params: { login: process.env.GEO_INTELLECT_EMAIL, uid: report.results.Uid }
                                        })
                                        console.log("deleted")
                                    }
                                    data[field] = JSON.stringify(objects)
                                }
                                catch (error) {
                                    data[field] = JSON.stringify([]);
                                }
                                break;
                            case "total_count":
                                const objects = [];
                                const turf = require('@turf/turf');
                                const roads = await util.state.get({
                                    state: "roads.json",
                                })
                                const housePoint = turf.point(row.coords);
                                const buffer = turf.buffer(housePoint, 20, { units: 'meters' });
                                for (const road of roads) {
                                    try {
                                        const roadLine = turf.lineString(road.geometry.coordinates);
                                        if (turf.booleanIntersects(roadLine, buffer)) {
                                            objects.push({
                                                Attributes: {
                                                    sum_result: road.properties?.sum_result || 0
                                                }
                                            });
                                        }
                                    }
                                    catch (error) {
                                        await tg.send_message({
                                            users: "@MR_Grives",
                                            text: error.message,
                                        })
                                        continue;
                                    }
                                }
                                data[field] = JSON.parse(objects)
                                break;
                            case "original_id":
                                data[field] = row.original_id;
                                break;
                            case "name":
                                data[field] = row.name;
                                break
                            case "traffic":
                                data[field] = row.name;
                                break
                        }
                    }
                    update_list.set(row.id, data);
                    state = await util.state.update(state, {
                        index: state.index + 1
                    }, "state.json")
                }
                if (update_list.size > 0) {
                    const params = [];
                    const values = [];
                    const updated = []
                    const items = Array.from(update_list.values());
                    items.forEach((item, index) => {
                        fields.forEach((field) => {
                            params.push(item.id, item[field]);
                        })
                        values.push(`($${index * 2 + 1}::integer, $${index * 2 + 2}::jsonb)`);
                    });
                    const query = `
                        WITH updated AS (
                            UPDATE buildings AS b
                            SET features = v.features
                            FROM (VALUES ${values.join(', ')}) AS v(id, features)
                            WHERE b.id = v.id
                            RETURNING 
                                b.id,
                                b.features,
                                CASE 
                                    WHEN COALESCE(b.name, '[null]') = '[null]' THEN 'какое то местечko' 
                                    ELSE COALESCE(NULLIF(TRIM(b.name), ''), 'какое то местечko') 
                                END as name,
                                ST_X(ST_Transform(ST_Centroid(b.geom), 4326)) as lon,
                                ST_Y(ST_Transform(ST_Centroid(b.geom), 4326)) as lat
                        )
                        SELECT 
                            id,
                            name,
                            features,
                            ROUND(lon::numeric, 6)::text || ',' || ROUND(lat::numeric, 6)::text as ref
                        FROM updated
                        ORDER BY id;
                    `;
                    const updates = await pg.query({
                        query: query,
                        params: params
                    });
                    for (const update of updates) {
                        total_count = 0;
                        if (!update.features || update.features.length == 0) {
                            console.log(`Пропущено нет features`);
                            continue;
                        }
                        for (const feature of update.features) {
                            const diapazon = feature.Attributes.diapazon.match(/\d+/g);
                            const numbers = diapazon.map(Number)
                            total_count += Math.max(...numbers);
                        }
                        updated.push({
                            id: update.id,
                            name: update.name,
                            total_count: total_count,
                            coords: `https://2gis.ru/geo/${update.ref}?zoom=13`,
                        })
                    }
                    await google.sheets.append({
                        items: updated,
                        uid: spreadsheet.spreadsheetId,
                        range: `${spreadsheet.sheets[state.current_list].properties.title}!A2`,
                    })
                }
                state = await util.state.update(state, {
                    index: 0,
                    offset: state.offset + state.pageSize,
                }, "state.json")
            }
            catch (error) {
                console.log(error.message)
                await tg.send_message({
                    users: "@MR_Grives",
                    text: error.message,
                })
                if (error.message.includes("Quota exceeded")) {
                    await tg.send_message({
                        users: "@MR_Grives",
                        text: `Превышен лимит запросов в секунду`,
                    })
                    console.log("Превышен лимит запросов в секунду")
                    await new Promise(resolve => setTimeout(resolve, 1000));
                };
                if (error.message.includes("10000000 cells")) {
                    await tg.send_message({
                        users: "@MR_Grives",
                        text: `Колличество записей в ячейке 1 миллион, будем создавать новую табличку`,
                    })
                    console.log("Колличество записей в ячейке 1 миллион, будем создавать новую табличку")
                    const res = await google.google_sheets.create.table({
                        files: files
                    });
                    spreadsheet = await google.google_sheets.get({
                        uid: res.spreadsheetId,
                    });
                    files = await google.google_drive.get({
                        name: "расчет трафика"
                    });
                    await tg.send_message({
                        users: "@MR_Grives",
                        text: `Таблица успешно создана ${spreadsheet.spreadsheetId}`,
                    })
                    await tg.send_message({
                        users: "@MR_Grives",
                        text: `Новое колличестов таблиц в системе ${files.length}`,
                    })
                    console.log("Таблица успешно создана ", spreadsheet.spreadsheetId)
                    console.log("Новое колличестов таблиц в системе ", files.length)
                    continue;
                };
                if (error.message.includes("max_values")) {
                    await google.google_sheets.create.list({
                        uid: spreadsheet.spreadsheetId
                    })
                    spreadsheet = await google.google_sheets.get({
                        uid: spreadsheet.spreadsheetId,
                    });
                    state = await util.state.update(state, {
                        current_list: spreadsheet.sheets.length - 1,
                    }, "state.json")
                    continue;
                };
            }
        }
        res.json({ message: "Процесс обработки запущен" })
    }
    catch (error) {
        return res.json({
            error: "Внутренняя ошибка сервера",
            message: error.message,
        })
    }
})

app.post("/api/items/export", async (_, res) => {
    try {
        const query = `
            SELECT json_agg(
               json_build_object(
                   'id', COALESCE(b.original_id, 'Не указан'),
                   'name', COALESCE(b.name, 'Название дома'),
                   'coords', ARRAY[
                       ST_X(ST_Centroid(b.geom)),  -- долгота (lon)
                       ST_Y(ST_Centroid(b.geom))   -- широта (lat)
                   ],
                   'total_count', (
                       SELECT COALESCE(
                           SUM(
                               CASE 
                                   -- Простой маппинг диапазонов
                                   WHEN f->'properties'->>'diapazon' = 'менее 1000' THEN 1000
                                   WHEN f->'properties'->>'diapazon' = '1000-5000' THEN 3000
                                   WHEN f->'properties'->>'diapazon' = '5000-10000' THEN 7500
                                   WHEN f->'properties'->>'diapazon' = '10000-20000' THEN 15000
                                   WHEN f->'properties'->>'diapazon' = '20000-50000' THEN 35000
                                   WHEN f->'properties'->>'diapazon' = 'более 50000' THEN 50000
                                   -- Если есть просто число
                                   WHEN f->'properties'->>'diapazon' ~ '^\d+$' THEN 
                                       (f->'properties'->>'diapazon')::integer
                                   ELSE 0
                               END
                           ),
                           0
                       )
                       FROM jsonb_array_elements(b.features) f
                   ),
                   'roads', (
                       SELECT COALESCE(
                           json_agg(
                               json_build_object(
                                   'original_id', r.original_id
                               )
                           ),
                           '[]'::json
                       )
                       FROM roads r
                       WHERE r.id = ANY(b.road_ids)
                   )
               )
            ) as result
            FROM buildings b
            WHERE b.features IS NOT NULL 
            AND b.geom IS NOT NULL;
        `;
        const [rows] = await pg.query({
            query: query
        })
        const items = await google.append({
            items: rows.result
        })
        res.json({
            message: "Успешно импортировно в google drive " + items.length
        })
    }
    catch (error) {
        res.status(500).json({
            error: "Внутренняя ошибка сервера",
            details: error.message
        });
    }
})

app.post("/api/tg/send", async (req, res) => {
    const { type, message, users } = req.body;
    try {
        let msg = null;
        switch (type) {
            case "file":
                msg = await tg.send_file({
                    files: message.files,
                    users: users,
                })
                break;
            case "text":
                msg = await tg.send_message({
                    users: users,
                    text: message.text,
                })
                break;
        }
        res.json({
            message: `Сообщение '${msg.id}' успешно отправленно`
        })
    }
    catch (error) {
        return res.json({
            message: error.message,
            error: "Внутренняя ошибка сервера",
        })
    }
})

app.listen(3001, () => {
    console.log("Сервер запущен на порту 3001, host: geointellect")
})





// const api = await util.api.get({
//     name: extractor,
//     services: { osm, gis },
// })
// const api_config = {
//     osm: {
//         params: {
//             timeout: 1,
//             coords, radius,
//             type: type.name == "raods" ? "higway" : "building"
//         },
//         endpoint: "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
//     },
//     gis: {
//         params: {
//             lon: coords[0],
//             lat: coords[1],
//             type: type.name == "roads" ? "street" : "building",
//             radius, fields: "items.geometry.hover,items.geometry.selection",
//         },
//         endpoint: "https://platform.2gis.ru/api/services/geocoder",
//     }
// }