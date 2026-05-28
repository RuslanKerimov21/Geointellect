require("dotenv").config();
const path = require("path");
const util = require("./util.service")();
const { google } = require('googleapis');
const { GOOGLE } = require("../constants");
const { GoogleAuth } = require('google-auth-library');
module.exports = () => {
    const service = (() => {
        const auth = new GoogleAuth({
            keyFile: path.join(process.cwd(), "data", "credentials.json"),
            scopes: [
                "https://www.googleapis.com/auth/spreadsheets",
                "https://www.googleapis.com/auth/drive"
            ],
        })
        return {
            auth,
            googledrive: google.drive({ version: 'v3', auth }),
            spreadsheet: google.sheets({ auth, version: 'v4' }),
        }
    })()
    return {
        sheets: {
            updateValues: async function ({ uid, range, items }) {
                const values = [];
                const fields = [
                    { key: "road_id", value: "ID Дороги" },
                    { key: "diapazon", value: "Пешеходный траффик чел/день" },
                    { key: "road_length", value: "Длина отрезка м/кв" },
                    { key: "uri", value: "Координаты" },
                ]
                try {
                    for (const el of items) {
                        const params = [];
                        for (const field of fields) {
                            if (field.key in el) {
                                params.push(el[field.key]);
                            }
                        }
                        values.push(params)
                    }
                    const headers = await service.spreadsheet.spreadsheets.values.get({
                        spreadsheetId: uid,
                        range: range,
                    })
                    await service.spreadsheet.spreadsheets.values.update({
                        spreadsheetId: uid,
                        range: range,
                        valueInputOption: "USER_ENTERED",
                        resource: {
                            values: headers.data?.values?.length > 0 ? values : [fields.map(el => el.value), ...values]
                        }
                    })
                }
                catch (error) {
                    throw error;
                }
            },
            appendValues: async function ({ items, uid, range }) {
                const values = [];
                const fields = [
                    { key: "road_id", value: "ID Дороги" },
                    { key: "segment_diapazon", value: "Пешеходный траффик чел/день" },
                    { key: "segment_length", value: "Длина отрезка м/кв" },
                    { key: "segment_coords", value: "Координаты" },
                ]
                try {
                    for (const el of items) {
                        const params = [];
                        for (const field of fields) {
                            if (field.key in el) {
                                params.push(el[field.key]);
                            }
                        }
                        values.push(params)
                    }
                    const headers = await service.spreadsheet.spreadsheets.values.get({
                        spreadsheetId: uid,
                        range: range,
                    })
                    await service.spreadsheet.spreadsheets.values.append({
                        spreadsheetId: uid,
                        range: range,
                        valueInputOption: "USER_ENTERED",
                        resource: {
                            values: headers.data?.values?.length > 0 ? values : [fields.map(el => el.value), ...values]
                        }
                    })
                    return items;
                }
                catch (error) {
                    throw error;
                }
            },
            getTable: async function ({ uid }) {
                try {
                    const res = await service.spreadsheet.spreadsheets.get({
                        spreadsheetId: uid,
                        fields: "spreadsheetId,sheets.properties",
                    });
                    return res.data;
                }
                catch (error) {
                    throw error;
                }
            },
            createTable: async function ({ files }) {
                try {
                    let state = {
                        title: process.env.FILE_NAME,
                        idx: 1,
                    };
                    const title = files.map(
                        el => el.name
                    )
                    while (title.includes(`${state.title} ${state.idx}`)) {
                        state.idx++;
                    }
                    const res = await service.spreadsheet.spreadsheets.create({
                        resource: {
                            properties: {
                                title: `${Object.values(state).join(" ")}`,
                            },
                            sheets: [{
                                properties: {
                                    title: "Лист1"
                                }
                            }]
                        }
                    })
                    for (const premission of GOOGLE.premissions) {
                        await service.googledrive.permissions.create({
                            fileId: res.data.spreadsheetId,
                            requestBody: {
                                type: "user",
                                role: "writer",
                                emailAddress: premission,
                            },
                            fields: "id",
                        })
                    }
                    return res.data;
                }
                catch (error) {
                    throw error;
                }
            },
            createList: async function ({ uid }) {
                try {
                    let state = {
                        title: "Лист",
                        idx: 1,
                    };
                    const spreadsheet = await service.spreadsheet.spreadsheets.get({
                        spreadsheetId: uid,
                        fields: 'sheets.properties'
                    });
                    const title = spreadsheet.data.sheets.map(
                        sheet => sheet.properties.title
                    );
                    while (title.includes(`${state.title}${state.idx}`)) {
                        state.idx++;
                    }
                    const res = await service.spreadsheet.spreadsheets.batchUpdate({
                        spreadsheetId: uid,
                        resource: {
                            requests: [
                                {
                                    addSheet: {
                                        properties: {
                                            title: `${Object.values(state).join("")}`,
                                        },
                                    },
                                },
                            ],
                        },
                    });
                    return res.data.replies.at(-1).addSheet.properties.title;
                }
                catch (error) {
                    throw error;
                }
            }
        },
        drive: {
            loadFiles: async function ({ capiton }) {
                const items = [];
                const file_list = await this.getFiles({ name: capiton });
                for (const file of file_list) {
                    try {
                        const res = await fetch(`https://docs.google.com/spreadsheets/d/${file.id}/export?format=xlsx`, {
                            headers: { Authorization: `Bearer ${await service.auth.getAccessToken()}` }
                        })
                        if (!res.ok) {
                            continue;
                        }
                        const buffer = Buffer.from(
                            await res.arrayBuffer()
                        );
                        const path = await util.docs.create({
                            name: `${file.name}.xlsx`,
                            buffer
                        })
                        items.push({
                            path,
                            caption: file.name,
                        })
                    }
                    catch (error) {
                        throw error;
                    }
                }
                return items;
            },
            getFiles: async function ({ name }) {
                try {
                    const files = await service.googledrive.files.list({
                        q: `mimeType='application/vnd.google-apps.spreadsheet'and trashed=false and name contains '${name}'`,
                        fields: 'files(id, name, createdTime, modifiedTime)',
                        orderBy: "createdTime asc",
                        pageSize: 100,
                    });
                    return files.data.files;
                }
                catch (error) {
                    throw error;
                }
            },
            deleteFiles: async function ({ name }) {
                try {
                    const files = await this.getFiles({
                        name: name,
                    })
                    for (const file of files) {
                        service.googledrive.files.delete({
                            fileId: file.id,
                        })
                    }
                }
                catch (error) {
                    throw error;
                }
            }
        }
    }
}