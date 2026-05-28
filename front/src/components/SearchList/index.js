export default function SearchList({ items, action }) {
    return (
        <ul className="search__list">
            {items?.length > 0 ? (
                items.map(el => (
                    <li
                        key={el.id}
                        onClick={() => action(el)}
                        className="search__item"
                    >
                        <span>{el.full_name}</span>
                    </li>
                ))
            ) : null}
        </ul>
    )
}