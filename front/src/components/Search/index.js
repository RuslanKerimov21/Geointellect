import "./index.css";
import { useEffect, useState } from "react";
import { ProgressBar, SearchList } from "..";
export default function Search({ setCenter }) {
    const [items, setItems] = useState([]);
    const [value, setValue] = useState("");
    const [loading, setLoading] = useState(false);
    useEffect(() => {
        if (value.length > 0) {
            setLoading(true)
            fetch(`https://catalog.api.2gis.com/3.0/items/geocode?q=${value}&fields=items.point&key=${process.env.REACT_APP_2GIS_KEY}`).then((res) => {
                return res.ok ? res.json() : null
            }).then((data) => {
                setItems(data ? data?.result?.items : []);
            }).finally(() => {
                setLoading(false)
            })
        }
    }, [value])
    async function actionClick(el) {
        const coords = [el.point.lon, el.point.lat]
        setCenter(coords);
        setItems(null);
        setValue("");
    }
    return (
        <div className="search">
            <div className="search__top">
                <input
                    type="text"
                    value={value}
                    onChange={(e) => {
                        setValue(e.target.value);
                    }}
                    placeholder="Введите запрос или адрес"
                />
                {value.length > 0 &&
                    <button aria-label="clear" onClick={() => setValue("")}>
                        <i class="icon clear" role="img"></i>
                    </button>
                }
            </div>
            <div className="search__bottom">
                {(loading ? (
                    <ProgressBar size={20} />
                ) : (
                    <SearchList items={items} action={actionClick} />
                ))}
            </div>
        </div>
    )
}
// const Span = ({ el, searchQuery }) => {
//     const { parts, hasMatches } = useMemo(() => {
//         const normalizedQuery = searchQuery.toLowerCase().trim();
//         if (!normalizedQuery) return { parts: [el.full_name], hasMatches: false };
//         const searchTerms = normalizedQuery.split(/\s+/).filter(Boolean);
//         const regex = new RegExp(`(${searchTerms.map(term =>
//             term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
//         ).join('|')})`, 'gi');
//         const parts = el.full_name.split(regex);
//         const hasMatches = parts.some(part =>
//             searchTerms.some(term => part.toLowerCase() === term.toLowerCase())
//         );
//         return { parts, hasMatches };
//     }, [el.full_name, searchQuery]);
//     if (!hasMatches) return <span>{el.full_name}</span>;
//     return (
//         <Fragment>
//             {parts.map((part, index) => {
//                 const normalizedPart = part.toLowerCase();
//                 const isHighlighted = searchQuery.toLowerCase().split(/\s+/).some(term =>
//                     term && normalizedPart === term
//                 );

//                 return (
//                     <span
//                         key={`${el.id}-${index}-${part.substring(0, 10)}`}
//                         className={isHighlighted ? 'active' : undefined}
//                         data-highlight={isHighlighted}
//                     >
//                         {part}
//                     </span>
//                 );
//             })}
//         </Fragment>
//     );
// };