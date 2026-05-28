import "./index.css";
export default function ProgressBar({ size }) {
    return (
        <div className="progress__bar" style={{ width: size, height: size }}></div>
    )
}