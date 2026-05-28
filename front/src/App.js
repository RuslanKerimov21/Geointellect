import { LAYER } from "./constants";
import { services } from "./services";
import { Fragment, useEffect, useState } from "react";
import { Map, Modal, NoConnect, Search, SideBar } from "./components";
function App() {
  const [msg, setMsg] = useState(null);
  const [layers, setLayers] = useState([]);
  const [layer, setLayer] = useState(LAYER);
  const [center, setCenter] = useState(null);
  const [radius, setRadius] = useState(1000);
  const [loading, setLoading] = useState(true);
  const [isDrawing, setIsDrawing] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [currentLayers, setCurrentLayers] = useState([
    "buildings_osm",
  ])
  useEffect(() => {
    window.addEventListener('online', () => {
      setOnline(true)
      window.document.title = "GeoLib";
    });
    window.addEventListener('offline', () => {
      setOnline(false)
      window.document.title = "GeoLib Offline";
    });
    services.call({
      action: "storage",
      method: "get",
      params: {
        coords: "coords",
      }
    }).then((coords) => {
      if (!coords) {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const coords = [pos.coords.longitude, pos.coords.latitude]
            await services.call({ action: "storage", method: "set", params: { coords: JSON.stringify(coords) } });
            setCenter(coords)
          },
          async (error) => {
            setMsg(error.message)
          }
        )
      }
      else {
        setCenter(coords);
      }
    })
  }, [])
  useEffect(() => {
    fetch(`${process.env.REACT_APP_API_URL}layers?fields=id,name,slug,active`).then((res) => {
      return res.ok ? res.json() : null
    }).then((data) => {
      setLayers(data)
    }).catch((error) => {
      setMsg(error.message)
    })
  }, [])
  useEffect(() => {
    if (msg) {
      setMsg(null);
    }
  }, [msg])
  return (
    online ?
      <Fragment>
        {msg &&
          <Modal>
            {msg}
          </Modal>
        }
        <Map
          setMsg={setMsg}
          setCenter={setCenter}
          setLoading={setLoading}
          layers={currentLayers}
          isDrawing={isDrawing}
          loading={loading}
          radius={radius}
          center={center}
          layer={layer}
        />
        {!loading ?
          <Fragment>
            <Search
              setCenter={setCenter}
            />
            <SideBar
              layer={layer}
              radius={radius}
              layers={layers}
              isDrawing={isDrawing}
              currentLayers={currentLayers}
              setCurrentLayers={setCurrentLayers}
              setIsDrawing={setIsDrawing}
              setRadius={setRadius}
              setLayers={setLayers}
              setLayer={setLayer}
              setMsg={setMsg}
            />
          </Fragment>
          : null
        }
      </Fragment>
      :
      <NoConnect />
  );
}

export default App;
