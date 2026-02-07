module.exports = {
    GOOGLE: {
        premissions: ["oferredsheep@gmail.com", "wiwside@neural-map-426611-b6.iam.gserviceaccount.com"],
    },
    GEOMETRY_CONVERSION_STRATEGY: {
        MultiLineString: {
            target: "LineString",
            method: "first",
            sqlFunction: "ST_LineMerge"
        },
        MultiPolygon: {
            target: "Polygon",
            method: "first",
            sqlFunction: "ST_GeometryN"
        },
        GeometryCollection: {
            target: "Geometry",
            method: "extract",
            sqlFunction: "ST_CollectionExtract"
        }
    }
}