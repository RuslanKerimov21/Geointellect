import './index.css';
export default function Modal({ children }) {
    return (
        <div className="overlay">
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                {children}
            </div>
        </div>
    )
}