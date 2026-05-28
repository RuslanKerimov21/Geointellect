import "./index.css";
import { BUTTONS } from "../../constants";
import { services } from "../../services/index";
export default function SideBar({ isDrawing, setIsDrawing, radius, setRadius, layer, setLayer, layers, currentLayers, setCurrentLayers, setMsg }) {
    async function actionClick({ action }) {
        try {
            const res = await services.call({
                action: action.name,
                method: action.method,
                params: { fields: ["features"] },
            })
            setMsg(res.message)
        }
        catch (error) {
            setMsg(error.message)
        }
    }
    async function actionChange(value) {
        setCurrentLayers(
            prev => prev.includes(value) ?
                prev.filter(el => el !== value) :
                [...prev, value]
        )
    }
    return (
        <aside className="sidebar">
            <div className="sidebar__wrapper">
                <span className="sidebar__title">
                    GeoLib
                </span>
                <nav className="sidebar__nav">
                    <ul className="sidebar__nav__list">
                        <li>
                            <span>Режим рисования</span>
                            <div className={isDrawing ? "switch active" : "switch"} onClick={() => setIsDrawing(!isDrawing)}>
                                <div className="circle"></div>
                            </div>
                        </li>
                        <li>
                            <span>Тип создаваемых обьектов</span>
                            <div className="label__items">
                                {Array({ id: 2, name: "Дороги", value: "roads", fields: ["original_id", "geom"] }).map(el =>
                                    <div className="label__group" key={el.id}>
                                        <label style={{ width: "50px" }} htmlFor={el.slug}>{el.name}</label>
                                        <input
                                            id={el.id}
                                            type="radio"
                                            value={el.value}
                                            checked={el.value == layer.name}
                                            onChange={(e) => setLayer({ name: e.target.value, fields: el.fields })}
                                        />
                                    </div>
                                )}
                            </div>
                        </li>
                        <li>
                            <span>Слои</span>
                            <div className="label__items">
                                {layers.map(el =>
                                    el.active ? (
                                        <div className="label__group" key={el.id}>
                                            <label htmlFor="roads">{el.name}</label>
                                            <input
                                                id={el.id}
                                                type="checkbox"
                                                value={el.slug}
                                                checked={currentLayers.includes(el.slug)}
                                                onChange={(e) => actionChange(e.target.value)}
                                            />
                                        </div>
                                    ) : null
                                )}
                            </div>
                        </li>
                        <li>
                            <span>Радиус запроса в метрах</span>
                            <input
                                type="number"
                                value={radius}
                                onChange={(e) => setRadius(Number(e.target.value))}
                            />
                        </li>
                    </ul>
                </nav>
                <div className="sidebar__footer">
                    {BUTTONS.map(el =>
                        <button
                            key={el.id}
                            disabled={el.disabled}
                            onClick={() => actionClick({ action: el.action })}
                        >
                            {el.name}
                        </button>
                    )}
                </div>
            </div>
        </aside >
    )
}