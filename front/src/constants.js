export const LAYERS = [
    {
        id: 'roads',
        type: 'line',
        source: 'line',
        filter: [
            'match',
            ['sourceAttr', 'bar'],
            ['roads'],
            true,
            false,
        ],
        style: {
            color: '#0080f8ff',
            width: 4,
        },
    },
    {
        id: 'traffic',
        type: 'line',
        source: 'traffic',
        filter: [
            'match',
            ['sourceAttr', 'bar'],
            ['traffic'],
            true,
            false,
        ],
        style: {
            color: '#ff0e0eff',
            width: 4,
        },
    },
    {
        id: 'buildings',
        type: 'polygon',
        source: 'buildings',
        filter: [
            'match',
            ['sourceAttr', 'bar'],
            ['buildings'],
            true,
            false,
        ],
        style: {
            color: '#ff9100ff',
        },
    },
    {
        id: 'buildings_osm',
        type: 'polygon',
        source: 'buildings_osm',
        filter: [
            'match',
            ['sourceAttr', 'bar'],
            ['buildings_osm'],
            true,
            false,
        ],
        style: {
            color: 'rgb(185, 181, 177))',
        },
    },
    {
        id: 'intersects',
        type: 'polygon',
        source: 'intersects',
        filter: [
            'match',
            ['sourceAttr', 'bar'],
            ['intersects'],
            true,
            false,
        ],
        style: {
            color: '#ff0e0e40',
            outlineColor: '#ff0000',
            outlineWidth: 2,
        },
    }
]

export const FILEDS = [
    {
        layer: "roads",
        fields: ["original_id", "geom"],
    },
    {
        layer: "building",
        fields: ["original_id", "name", "geom", "road_ids", "roads_count", "features"]
    }
]

export const LAYER = {
    name: LAYERS.find(el => el.id == "roads").id,
    fields: FILEDS.find(el => el.layer == "roads").fields,
}

export const BUTTONS = [{
    id: 1,
    disabled: false,
    name: "Обновит все дороги",
    action: { name: "items", method: "update" }
},
{
    id: 2,
    disabled: false,
    name: "Выгрузка дорог",
    action: { name: "rows", method: "loaded" }
}, {
    id: 3,
    disabled: false,
    name: "Экспортировать в таблицу",
    action: { name: "items", method: "append" }
}]
