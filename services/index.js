module.exports = {
    pg: require("./pg.service")(),
    gis: require("./gis.service")(),
    geo: require("./geo.service")(),
    pp: require("./p.p.real.service"),
    util: require("./util.service")(),
    osm: require("./osm.service")(),
    google: require("./google.service")(),
}