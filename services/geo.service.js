const { Pool } = require('undici');
module.exports = () => {
    const pool = new Pool('https://api.geointellect.com', {
        connections: 30,
        pipelining: 3,
        connect: {
            timeout: 10000,
            rejectUnauthorized: true
        },
    });
    return {
        query_pool: async function ({ data, action, token }) {
            try {
                const urlencoded = new URLSearchParams(data).toString();
                const { body, headers, statusCode } = await pool.request({
                    path: `/${action}`,
                    method: 'POST',
                    headers: {
                        "gi_map_core_cr": token,
                        "content-type": "application/x-www-form-urlencoded",
                    },
                    body: urlencoded,
                });
                if (statusCode === 429) {
                    await new Promise(r => setTimeout(r, headers['retry-after'] || 60 * 1000));
                }
                if (statusCode >= 200 && statusCode < 300) {
                    const res = await body.json();
                    return res;
                }
                return null;
            }
            catch (error) {
                console.error(error.message)
                return null;
            }
        },
    }
}