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
            auth: auth,
            googledrive: google.drive({ version: 'v3', auth }),
            spreadsheet: google.sheets({ auth, version: 'v4' }),
        }
    })()
    return {
        sheets: {
            append: async function ({ items, uid, range }) {
                const values = [];
                for (const el of items) {
                    const params = [];
                    for (const value of Object.values(el)) {
                        params.push(value)
                    }
                    values.push(params)
                }
                try {
                    await service.spreadsheet.spreadsheets.values.append({
                        spreadsheetId: uid,
                        range: range,
                        valueInputOption: "USER_ENTERED",
                        resource: {
                            values: values
                        }
                    })
                    return items;
                }
                catch (error) {
                    console.log(error.message)
                }
            },
            get: async function ({ uid }) {
                const res = await service.spreadsheet.spreadsheets.get({
                    spreadsheetId: uid,
                    fields: "spreadsheetId,sheets.properties",
                });
                return res.data;
            },
            create: {
                table: async function ({ files }) {
                    let state = {
                        title: "Расчет трафика Москва",
                        idx: 1,
                    };
                    const titles = files.map(
                        el => el.name
                    )
                    while (titles.includes(`${state.title} ${state.idx}`)) {
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
                },
                list: async function ({ uid }) {
                    let state = {
                        title: "Лист",
                        idx: 1,
                    };
                    const spreadsheet = await service.spreadsheet.spreadsheets.get({
                        spreadsheetId: uid,
                        fields: 'sheets.properties'
                    });
                    const titles = spreadsheet.data.sheets.map(
                        sheet => sheet.properties.title
                    );
                    while (titles.includes(`${state.title}${state.idx}`)) {
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
            }
        },
        drive: {
            load: async function ({ capiton }) {
                const items = [];
                const file_list = await this.get({ name: capiton });
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
                        const path = await util.state.create({
                            name: `${file.name}.xlsx`,
                            buffer
                        })
                        items.push({
                            path,
                            caption: file.name,
                        })
                    }
                    catch {
                        continue;
                    }
                }
                return items;
            },
            get: async function ({ name }) {
                const files = await service.googledrive.files.list({
                    q: `mimeType='application/vnd.google-apps.spreadsheet'and trashed=false and name contains '${name}'`,
                    fields: 'files(id, name, createdTime, modifiedTime)',
                    pageSize: 100,
                });
                return files.data.files;
            },
            delete: async function ({ name }) {
                const files = await this.get({
                    name: name,
                })
                for (const file of files) {
                    await service.googledrive.files.delete({
                        fileId: file.id,
                    })
                }
            }
        }
    }
}