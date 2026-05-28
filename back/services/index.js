module.exports = {
    pg_client: require("./pg.service")(),
    gis_client: require("./2gis.service")(),
    osm_client: require("./osm.service")(),
    google_client: require("./google.service")(),
    geo_client: require("./geo.service"),
    tg_client: require("./tg.service"),
    util: require("./util.service")(),
}