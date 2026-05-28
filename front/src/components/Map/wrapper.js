import { memo } from "react";
export const Wrapper = memo(() => {
    return <div id="gl" style={{ width: '100%', height: '100vh' }}></div>;
}, () => true);