require("dotenv").config();
const app = require("express")();
const { pg_client, google_client, gis_client, geo_client, tg_client, osm_client, util } = require("./services/index");
app.use(require("express").json());
app.use(require("cors")());
app.get("/api/items/:id", async (req, res) => {
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
        const [rows] = await pg_client.query({
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
app.get("/api/items", async (req, res) => {
    let query;
    const authorization = req.headers.authorization;
    const [name, value] = authorization.split(" ");
    if (authorization.startsWith(name) && value.includes(process.env.TO_GIS_KEY)) {
        const { layer, bounds } = req.query;
        const [west, south, east, north] = bounds.split(',').map(Number);
        switch (layer) {
            case "roads":
                query = `
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
            case "buildings":
                query = `
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
            case "buildings_osm":
                query = `
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
                    FROM buildings_osm
                    WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326) 
                    AND geom IS NOT NULL
                `;
                break;
            case "traffic":
                query = `
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
            case "intersects":
                query = `
                    WITH house AS (
                        SELECT 
                            name,
                            geom,
                            geom::geography as geom_geog
                        FROM buildings_osm 
                        WHERE original_id = $1
                    ),
                    roads_at_start AS (
                        SELECT 
                            COUNT(DISTINCT r.id) as count_at_start
                        FROM roads r, house h
                        WHERE ST_DWithin(r.geom::geography, h.geom_geog, $2::float)  -- начальный радиус поиска
                    ),
                    radius_selector AS (
                        SELECT 
                            CASE 
                                WHEN (SELECT count_at_start FROM roads_at_start) >= 6 THEN $2::float  -- оставляем 19
                                ELSE 50  -- увеличиваем до 50
                            END as final_search_radius,
                            CASE 
                                WHEN (SELECT count_at_start FROM roads_at_start) >= 6 THEN $3::float  -- оставляем 19
                                ELSE 50  -- увеличиваем до 50
                            END as final_clip_radius,
                            (SELECT count_at_start FROM roads_at_start) as initial_count,
                            $2::float as original_search_radius,
                            $3::float as original_clip_radius
                    ),
                    nearby_roads AS (
                        SELECT 
                            r.id,
                            r.geom,
                            ST_Distance(r.geom::geography, h.geom_geog) as distance,
                            ST_Intersects(r.geom, ST_Buffer(h.geom_geog, rs.final_clip_radius)::geometry) as clipped,
                            ST_Intersection(r.geom, ST_Buffer(h.geom_geog, rs.final_clip_radius)::geometry) as clipped_geom,
                            rs.initial_count,
                            rs.final_search_radius,
                            rs.final_clip_radius,
                            rs.original_search_radius,
                            rs.original_clip_radius
                        FROM roads r, house h, radius_selector rs
                        WHERE ST_DWithin(r.geom::geography, h.geom_geog, rs.final_search_radius)  -- увеличенный радиус поиска
                    ),
                    road_segments AS (
                        SELECT 
                            nr.id,
                            nr.distance,
                            nr.clipped,
                            nr.initial_count,
                            nr.final_search_radius,
                            nr.final_clip_radius,
                            nr.original_search_radius,
                            nr.original_clip_radius,
                            (ST_Dump(
                                ST_Difference(
                                    nr.clipped_geom,
                                    (SELECT ST_Union(clipped_geom) 
                                     FROM nearby_roads nr2 
                                     WHERE nr2.id != nr.id)
                                )
                            )).geom as segment_geom
                        FROM nearby_roads nr
                        WHERE nr.clipped_geom IS NOT NULL
                    ),
                    road_polygons AS (
                        SELECT 
                            rs.id,
                            rs.distance,
                            rs.clipped,
                            rs.initial_count,
                            rs.final_search_radius,
                            rs.final_clip_radius,
                            rs.original_search_radius,
                            rs.original_clip_radius,
                            row_number() OVER (PARTITION BY rs.id ORDER BY ST_Length(rs.segment_geom)) as segment_num,
                            ST_Transform(
                                ST_Buffer(
                                    rs.segment_geom::geography,
                                    $4::float  -- ширина дороги
                                )::geometry,
                                4326
                            ) as geom_4326,
                            ST_Length(rs.segment_geom::geography) as segment_length
                        FROM road_segments rs
                        WHERE rs.segment_geom IS NOT NULL
                          AND ST_Length(rs.segment_geom::geography) > 0.1
                    )
                    SELECT 
                    json_build_object(
                        'name', (SELECT name FROM house),
                        'params', json_build_object(
                            'original_search_radius', $2::float,
                            'original_clip_radius', $3::float,
                            'road_width', $4::float,
                            'final_search_radius', COALESCE((SELECT final_search_radius FROM radius_selector), $2::float),
                            'final_clip_radius', COALESCE((SELECT final_clip_radius FROM radius_selector), $3::float),
                            'initial_roads_at_start', COALESCE((SELECT initial_count FROM radius_selector), 0),
                            'total_segments', COALESCE((SELECT COUNT(*) FROM road_polygons), 0),
                            'total_roads', COALESCE((SELECT COUNT(DISTINCT id) FROM road_polygons), 0),
                            'expanded', COALESCE((SELECT final_search_radius > original_search_radius FROM radius_selector), false),
                            'target_reached', COALESCE((SELECT COUNT(DISTINCT id) >= 6 FROM road_polygons), false)
                        ),
                        'geojson', json_build_object(
                            'type', 'FeatureCollection',
                            'features', COALESCE(
                                (SELECT json_agg(
                                    json_build_object(
                                        'type', 'Feature',
                                        'id', rp.id || '_' || rp.segment_num,
                                        'geometry', json_build_object(
                                            'type', 'Polygon',
                                            'coordinates', ST_AsGeoJSON(rp.geom_4326)::json->'coordinates'
                                        ),
                                        'properties', json_build_object(
                                            'road_id', rp.id,
                                            'segment_id', rp.segment_num,
                                            'distance', rp.distance,
                                            'clipped', rp.clipped,
                                            'segment_length', rp.segment_length,
                                            'found_at_search_radius', rp.final_search_radius,
                                            'clipped_at_radius', rp.final_clip_radius
                                        )
                                    )
                                    ORDER BY rp.id, rp.segment_num
                                ) FROM road_polygons rp),
                                '[]'::json
                            )
                        )
                    ) as result;
                `;
                break;
            default:
                return res.json({ message: "Не известный тип для таблицы" });
        }
        if (layer == "intersects") {
            const [row] = await pg_client.query({
                query: query,
                params: [1000037725, 19, 19, 0.3]
            })
            return res.json(row.result.geojson)
        }
        else {
            const [row] = await pg_client.query({
                query: query,
                params: [west, south, east, north]
            })
            return res.json(row.geojson)
        }
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
    const { coords, radius, layer } = req.body;
    try {
        const [lon, lat] = coords;
        const { features } = await gis_client.call({
            params: {
                lon: lon,
                lat: lat,
                radius,
                type: "building",
                fields: "items.geometry.hover,items.geometry.selection",
            },
            action: "https://platform.2gis.ru/api/services/geocoder",
        })
        if (features.length < 1) {
            return res.json({
                message: "Не найдено результатов в заданном радиусе"
            });
        }
        const rows = await pg_client.query({
            query: `SELECT original_id FROM ${layer.name} WHERE original_id = ANY($1)`,
            params: [features.map(el => el.id)]
        })
        const ids = rows.map(row => row.original_id);
        const items = features.filter(el => {
            return !ids.includes(el.id);
        });
        for (const el of items) {
            const data = {};
            const placeholders = [];
            const { id, geometry, properties } = el;
            const { name } = properties;
            for (const field of layer.fields) {
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
                        const [items_a] = await pg_client.query({
                            query: `WITH building_geom AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) as geom) SELECT COALESCE(array_agg(DISTINCT r.id), '{}') as road_ids FROM roads r CROSS JOIN building_geom bg WHERE ST_DWithin(r.geom::geography, bg.geom::geography, $2);`,
                            params: [geometry, 20]
                        })
                        data[field] = items_a[field];
                        break;
                    case "roads_count":
                        const [items_b] = await pg_client.query({
                            query: `WITH building_geom AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) as geom) SELECT COALESCE(array_agg(DISTINCT r.id), '{}') as road_ids FROM roads r CROSS JOIN building_geom bg WHERE ST_DWithin(r.geom::geography, bg.geom::geography, $2);`,
                            params: [geometry, 20]
                        })
                        data[field] = items_b["road_ids"].length;
                        break;
                }
            }
            for (const field of layer.fields) {
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
        await pg_client.query({
            params: params,
            query: `INSERT INTO ${layer.name} (${layer.fields.join(', ')}) VALUES ${values.join(',')} RETURNING id, original_id;`
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

app.post("/api/items/create/osm", async (req, res) => {
    const params = [];
    const values = [];
    const { radius, coords, layer } = req.body;
    try {
        const { features } = await osm_client.call({
            params: {
                timeout: 1,
                radius,
                coords,
            },
            action: "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
        })
        const rows = await pg_client.query({
            query: `SELECT original_id FROM roads WHERE original_id = ANY($1) `,
            params: [features.map(el => el.id)]
        })
        const ids = rows.map(row => row.original_id);
        const items = features.filter(el => {
            return !ids.includes(el.id);
        });
        for (const el of items) {
            const data = {};
            const placeholders = [];
            const { id, geometry, name } = el;
            for (const field of layer.fields) {
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
                        const [items_a] = await pg_client.query({
                            query: `WITH building_geom AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) as geom) SELECT COALESCE(array_agg(DISTINCT r.id), '{}') as road_ids FROM roads r CROSS JOIN building_geom bg WHERE ST_DWithin(r.geom::geography, bg.geom::geography, $2);`,
                            params: [geometry, 20]
                        })
                        data[field] = items_a[field];
                        break;
                    case "roads_count":
                        const [items_b] = await pg_client.query({
                            query: `WITH building_geom AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) as geom) SELECT COALESCE(array_agg(DISTINCT r.id), '{}') as road_ids FROM roads r CROSS JOIN building_geom bg WHERE ST_DWithin(r.geom::geography, bg.geom::geography, $2);`,
                            params: [geometry, 20]
                        })
                        data[field] = items_b["road_ids"].length;
                        break;
                }
            }
            for (const field of layer.fields) {
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
        if (values.length < 1) {
            return res.json({
                message: "Отсутсвуют данные для вставки"
            })
        }
        await pg_client.query({
            params: params, query: `INSERT INTO roads (${layer.fields.join(', ')}) VALUES ${values.join(',')} ON CONFLICT (original_id) DO NOTHING RETURNING id, original_id;`
        });
        res.json({ message: `Колличество: ${items.length}, успешно добавленно` });
    }
    catch (error) {
        return res.json({
            error: "Ошибка на стороне сервера",
            message: error.message,
        })
    }
})

app.post("/api/items/update", async (_, res) => {
    try {
        const tg = tg_client({
            phone: "+79057499836"
        })
        let state = await util.state.get({
            state: "state.json",
        });
        let files = await google_client.drive.getFiles({
            name: process.env.FILE_NAME
        })
        let spreadsheet = await google_client.sheets.getTable({
            uid: files.at(-1).id,
        })
        let client = await geo_client({
            headless: false,
            url: "https://web.geointellect.com",
        });
        while (true) {
            try {
                const items = [];
                const query_all = `
                    WITH paginated_roads AS (
                        SELECT 
                            r.id as road_id,
                            r.original_id,
                            r.geom,
                            r.features,
                            ST_Length(r.geom::geography) as road_length,
                            floor(ST_Length(r.geom::geography) / $1)::integer as segments_count
                        FROM roads r
                        WHERE r.geom IS NOT NULL 
                        AND r.features IS NULL
                        ORDER BY r.id
                        LIMIT $2 OFFSET $3
                    ),
                    all_segments AS (
                        SELECT
                            pr.road_id,
                            pr.original_id,
                            pr.geom,
                            pr.road_length,
                            generate_series(0, pr.segments_count) as segment_num,
                            ST_LineSubstring(
                                pr.geom,
                                (generate_series(0, pr.segments_count) * $1) / NULLIF(pr.road_length, 0),
                                LEAST(((generate_series(0, pr.segments_count) + 1) * $1) / NULLIF(pr.road_length, 0), 1.0)
                            ) as segment_geom,
                            ST_Transform(
                                ST_Buffer(
                                    ST_LineSubstring(
                                        pr.geom,
                                        (generate_series(0, pr.segments_count) * $1) / NULLIF(pr.road_length, 0),
                                        LEAST(((generate_series(0, pr.segments_count) + 1) * $1) / NULLIF(pr.road_length, 0), 1.0)
                                    )::geography,
                                    $4
                                )::geometry,
                                4326
                            ) as segment_polygon_4326
                        FROM paginated_roads pr
                    )
                    SELECT 
                        pr.road_id,
                        (
                            SELECT json_agg(
                                json_build_object(
                                    'road_id', asg.road_id,
                                    'original_id', asg.original_id,
                                    'segment_uri', CONCAT(
                                        ROUND(ST_Y(ST_LineInterpolatePoint(asg.segment_geom, 0.5))::numeric, 6),
                                        ',',
                                        ROUND(ST_X(ST_LineInterpolatePoint(asg.segment_geom, 0.5))::numeric, 6)
                                    ),
                                    'segment_length', ROUND(ST_Length(asg.segment_geom::geography)::numeric, 2)
                                ) ORDER BY asg.segment_num
                            )
                            FROM all_segments asg
                            WHERE asg.road_id = pr.road_id
                        ) as road_segments
                    FROM paginated_roads pr
                    ORDER BY pr.road_id;
                `;
                const [row] = await pg_client.query({
                    query: `SELECT COUNT(*) as count FROM roads WHERE features IS NULL`,
                })
                console.log(row.count)
                if (state.offset >= row.count) {
                    state = await util.state.update(state, {
                        offset: 0,
                    }, "state.json");
                    const files = await google_client.drive.loadFiles({
                        capiton: process.env.FILE_NAME,
                    })
                    await tg.sendFile({
                        users: "@MR_Grives",
                        files: files
                    })
                    break;
                }
                const rows = await pg_client.query({
                    query: query_all,
                    params: [10, state.pageSize, state.offset, 0.3],
                });
                for (const [i, row] of rows.entries()) {
                    console.log(`Текущий индекс: ${i}`, `Колличество сегментов: ${row.road_segments.length}`, `Колличество дорог ${rows.length}`)
                    const segments = [];
                    for (const segment of row.road_segments) {
                        const { segment_uri, segment_length } = segment;
                        const [lat, lon] = segment_uri.split(",");
                        let res = await client.call({
                            action: "glayer/do_identify",
                            params: {
                                zoom: 20,
                                xlon: lon,
                                ylat: lat,
                                aswgs: true,
                                gilayers: JSON.stringify([{ "Id": 4032, "Name": "Оценка пешеходного потока (МСК)", "Filter": [], "LegendItems": [0, 1, 2, 3, 4, 5, 6], "Opacity": 1, "Index": 2 }]),
                            }
                        })
                        if (res.message.includes("НЕТ ДОСТУПА [key]")) {
                            await client.authPage();
                            res = await client.call({
                                action: "glayer/do_identify",
                                params: {
                                    zoom: 20,
                                    xlon: lon,
                                    ylat: lat,
                                    aswgs: true,
                                    gilayers: JSON.stringify([{ "Id": 4032, "Name": "Оценка пешеходного потока (МСК)", "Filter": [], "LegendItems": [0, 1, 2, 3, 4, 5, 6], "Opacity": 1, "Index": 2 }]),
                                }
                            })
                            continue;
                        }
                        if (res.results) {
                            const [item] = res.results;
                            const [feature] = item.features;
                            segments.push({
                                segment_length: segment_length,
                                segment_diapazon: feature?.properties?.diapazon || "0",
                                feature_coords: feature?.geometry?.coordinates || null,
                                feature_bbox: feature?.bbox || null,
                                segment_coords: segment_uri,
                            })
                        }
                    }
                    items.push({
                        road_id: row.road_id,
                        features: segments,
                    })
                }
                console.log(`Колличество эллементов для обновления ${items.length}`)
                if (items.length > 0) {
                    const segments = [];
                    const placeholders = items.map((_, i) =>
                        `($${i * 2 + 1}::integer, $${i * 2 + 2}::jsonb)`
                    ).join(',');
                    const query = `
                        WITH temp_updates AS (
                            SELECT 
                                t.id::integer, 
                                t.features::jsonb
                            FROM (VALUES ${placeholders}) AS t(id, features)
                        )
                        UPDATE roads r
                        SET 
                            features = t.features
                        FROM temp_updates t
                        WHERE r.id = t.id
                        RETURNING 
                            r.id, 
                            r.features;
                    `;
                    const values = items.flatMap(el =>
                        [el.road_id, JSON.stringify(el.features)]
                    )
                    const updates = await pg_client.query({
                        query: query,
                        params: values,
                    });
                    for (const update of updates) {
                        for (const feature of update.features) {
                            segments.push({
                                road_id: update.id,
                                segment_diapazon: feature.segment_diapazon,
                                segment_length: feature.segment_length,
                                segment_coords: feature.segment_coords,
                            })
                        }
                    }
                    if (segments.length > 0) {
                        await google_client.sheets.appendValues({
                            items: segments,
                            uid: spreadsheet.spreadsheetId,
                            range: `${spreadsheet.sheets[state.currentList].properties.title}!A1`,
                        })
                    }
                }
                state = await util.state.update(state, {
                    offset: state.offset + rows.length,
                }, "state.json")
            }
            catch (error) {
                console.log(error.message)
                if (error.message.includes("Quota exceeded")) {
                    await tg.sendMsg({
                        users: "@MR_Grives",
                        text: `Превышен лимит запросов в секунду`,
                    })
                    await new Promise(resolve => setTimeout(resolve, 1000));
                };
                if (error.message.includes("10000000 cells")) {
                    await tg.sendMsg({
                        users: "@MR_Grives",
                        text: `Колличество записей в ячейке 1 миллион, будем создавать новую табличку`,
                    })
                    const res = await google_client.sheets.createTable({
                        files: files
                    });
                    spreadsheet = await google_client.sheets.getTable({
                        uid: res.spreadsheetId,
                    });
                    files = await google_client.drive.getFiles({
                        name: process.env.FILE_NAME
                    });
                    await tg.sendMsg({
                        users: "@MR_Grives",
                        text: `Таблица успешно создана ${spreadsheet.spreadsheetId}`,
                    })
                    await tg.sendMsg({
                        users: "@MR_Grives",
                        text: `Новое колличестов таблиц в системе ${files.length}`,
                    })
                    continue;
                };
                if (error.message.includes("max_values")) {
                    await google_client.sheets.createList({
                        uid: spreadsheet.spreadsheetId
                    })
                    spreadsheet = await google_client.sheets.getTable({
                        uid: spreadsheet.spreadsheetId,
                    });
                    state = await util.state.update(state, {
                        currentList: spreadsheet.sheets.length - 1,
                    }, "state.json")
                    continue;
                };
            }
        }
        res.json({ message: "is ok" })
    }
    catch (error) {
        throw new Error(error.message);
    }
})

app.post("/api/items/append", async (req, res) => {
    try {
        const ref = "g v";
        const tg = tg_client({
            phone: "+79057499836",
        })
        let state = await util.state.get({
            state: "export.state.json",
        });
        let files = await google_client.drive.getFiles({
            name: ref
        })
        let spreadsheet = await google_client.sheets.getTable({
            uid: files.at(-1).id,
        })
        while (true) {
            try {
                const exports = []
                const [row] = await pg_client.query({
                    query: `SELECT COUNT(*) as count FROM buildings_osm WHERE name NOT ILIKE ALL($1)`,
                    params: [excludes],
                })
                if (state.offset >= row.count) {
                    const files = await google_client.drive.loadFiles({
                        capiton: ref
                    });
                    await tg.sendFile({
                        files: files,
                        users: "@MR_Grives,@Mis_cha"
                    })
                    break;
                }
                const query = `
                    SELECT original_id as id,
                        CASE 
                            WHEN COALESCE(name, '[null]') = '[null]' THEN 'какое то местечko' 
                            ELSE COALESCE(NULLIF(TRIM(name), ''), 'какое то местечko') 
                        END as name,
                        features,
                        json_build_array(
                            ROUND(ST_X(ST_Transform(ST_Centroid(geom), 4326))::numeric, 6),
                            ROUND(ST_Y(ST_Transform(ST_Centroid(geom), 4326))::numeric, 6)
                        ) as coords
                    FROM buildings_osm
                    WHERE name NOT ILIKE ALL($3)
                    ORDER BY original_id, id DESC
                    LIMIT $1 OFFSET $2;
                `;
                const rows = await pg_client.query({
                    query: query,
                    params: [state.pageSize, state.offset, excludes],
                });
                console.log("Общеее колличество обьектов: ", row.count)
                console.log("Колличество обьектов страницы: ", rows.length)
                if (rows.length === 0) {
                    state = await util.state.update(state, {
                        offset: state.offset + state.pageSize,
                    }, "export.state.json")
                    continue;
                }
                for (const row of rows) {
                    let total_count = 0;
                    for (const feature of row.features) {
                        const diapazon = feature?.Attributes?.diapazon.match(/\d+/g) || "0";
                        const numbers = diapazon.map(Number)
                        total_count += Math.max(...numbers);
                    }
                    exports.push({
                        id: row.id,
                        name: row.name,
                        total_count: total_count,
                        uri: `https://2gis.ru/geo/${row.uri}?zoom=13`,
                    })
                }
                console.log("Колличество экспортируемых эллементов: ", exports.length)
                await google_client.sheets.appendValues({
                    items: exports,
                    uid: spreadsheet.spreadsheetId,
                    range: `${spreadsheet.sheets[state.currentList].properties.title}!A1`,
                })
                state = await util.state.update(state, {
                    offset: state.offset + state.pageSize,
                }, "export.state.json")
            }
            catch (error) {
                console.log(error.message)
                if (error.message.includes("Quota exceeded")) {
                    await tg.sendMsg({
                        users: "@MR_Grives",
                        text: `Превышен лимит запросов в секунду`,
                    })
                    await new Promise(resolve => setTimeout(resolve, 1000));
                };
                if (error.message.includes("10000000 cells")) {
                    await tg.sendMsg({
                        users: "@MR_Grives",
                        text: `Колличество записей в ячейке 1 миллион, будем создавать новую табличку`,
                    })
                    const res = await google_client.sheets.createTable({
                        files: files,
                        ref: ref,
                    });
                    spreadsheet = await google_client.sheets.getTable({
                        uid: res.spreadsheetId,
                    });
                    files = await google_client.drive.getFiles({
                        name: ref
                    });
                    await tg.sendMsg({
                        users: "@MR_Grives",
                        text: `Таблица успешно создана ${spreadsheet.spreadsheetId}`,
                    })
                    await tg.sendMsg({
                        users: "@MR_Grives",
                        text: `Новое колличестов таблиц в системе ${files.length}`,
                    })
                    continue;
                };
                if (error.message.includes("max_values")) {
                    await google_client.sheets.createList({
                        uid: spreadsheet.spreadsheetId
                    })
                    spreadsheet = await google_client.sheets.getTable({
                        uid: spreadsheet.spreadsheetId,
                    });
                    state = await util.state.update(state, {
                        currentList: spreadsheet.sheets.length - 1,
                    }, "export.state.json")
                    continue;
                };
            }
        }
    }
    catch (error) {
        throw new Error(error.message)
    }
})

app.get("/api/layers", async (req, res) => {
    const { fields } = req.query;
    try {
        const layers = await pg_client.query({
            query: `SELECT ${fields} FROM layers`,
        })
        res.json(layers)
    }
    catch (error) {
        return res.json({
            error: "Внутренняя ошибка сервера",
            message: error.message
        })
    }
})

app.post("/api/tg/send", async (req, res) => {
    const { type, message, users } = req.body;
    try {
        let msg = null;
        switch (type) {
            case "file":
                msg = await tg.sendFile({
                    files: message.files,
                    users: users,
                })
                break;
            case "text":
                msg = await tg.sendMsg({
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

app.listen(process.env.API_PORT, () => {
    console.log(`Сервер запущен на порту ${process.env.API_PORT}, host: ${process.env.API_HOST}`)
});