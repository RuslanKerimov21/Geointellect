import "./index.css";
export default function NoConnect() {
    return (
        <section className="no__connect" style={{ background: `url(/layer.png)` }}>
            <h1 className="title">Нет интернета</h1>
            <p className="descr">Проверьте наличие соединения и попробуйте еще раз</p>
        </section>
    )
}