require("dotenv").config();
const { Pool } = require("pg");
module.exports = () => {
    const pool = new Pool({
        host: process.env.POSTGRESS_HOST,
        user: process.env.POSTGRESS_USER,
        database: process.env.POSTGRESS_DATABASE,
        password: process.env.POSTGRESS_PASSWORD,
        port: process.env.POSTGRESS_PORT,
    })
    return {
        query: async function ({ query, params }) {
            const client = await pool.connect();
            try {
                const res = await client.query(query, params ? params : null);
                return res.rows;
            }
            catch (error) {
                console.error(error.message)
                throw error;
            }
            finally {
                client.release();
            }
        },
    }
}