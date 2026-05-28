require("dotenv").config();
const tdl = require('tdl');
const path = require('path');
const { getTdjson } = require('prebuilt-tdlib');
const rd = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
})
let client = null;
module.exports = ({ phone }) => {
    if (!client) {
        client = init();
    }
    function init() {
        tdl.configure({
            tdjson: getTdjson()
        });
        const client = tdl.createClient({
            apiId: process.env.TELEGRAM_APP_ID,
            apiHash: process.env.TELEGRAM_API_HASH,
            filesDirectory: path.join(process.cwd(), "tg", '_td_files'),
            databaseDirectory: path.join(process.cwd(), "tg", '_td_database'),
        })
        client.on("update", async (ctx) => {
            if (ctx._ == "updateAuthorizationState") {
                switch (ctx.authorization_state._) {
                    case "authorizationStateWaitPhoneNumber":
                        rd.question("Введите номер телефона:", async (phone) => {
                            await client.invoke({
                                _: 'setAuthenticationPhoneNumber',
                                phone_number: phone
                            });
                            rd.close();
                        });
                        break;
                    case "authorizationStateWaitCode":
                        rd.question("Введите код из SMS:", async (code) => {
                            await client.invoke({
                                _: "checkAuthenticationCode",
                                code: code.trim(),
                            })
                            rd.close();
                        });
                        break;
                    case "authorizationStateWaitPassword":
                        rd.question("Введите пароль 2FA:", async (password) => {
                            await client.invoke({
                                _: "checkAuthenticationPassword",
                                password: password.trim()
                            });
                            rd.close();
                        });
                        break;
                    case "authorizationStateReady":
                        console.log("✅ Авторизация успешна!");
                        break;
                    case "authorizationStateClosed":
                        console.log('Сессия закрыта');
                        process.exit();
                }
            }
        })
        return client;
    }
    return {
        initiaLize: async function () {
            tdl.configure({
                tdjson: getTdjson()
            });
            const client = tdl.createClient({
                apiId: process.env.TELEGRAM_APP_ID,
                apiHash: process.env.TELEGRAM_API_HASH,
                filesDirectory: path.join(process.cwd(), "tg", '_td_files'),
                databaseDirectory: path.join(process.cwd(), "tg", '_td_database'),
            })
            client.on("update", async (update) => {
                if (update._ == "updateAuthorizationState") {
                    switch (update.authorization_state._) {
                        case "authorizationStateWaitPhoneNumber":
                            rd.question("Введите номер телефона:", async () => {
                                await client.invoke({
                                    _: 'setAuthenticationPhoneNumber',
                                    phone_number: phone
                                });
                                rd.close();
                            });
                            break;
                        case "authorizationStateWaitCode":
                            rd.question("Введите код из SMS:", async (code) => {
                                await client.invoke({
                                    _: "checkAuthenticationCode",
                                    code: code.trim(),
                                })
                                rd.close();
                            });
                            break;
                        case "authorizationStateWaitPassword":
                            rd.question("Введите пароль 2FA:", async (password) => {
                                await client.invoke({
                                    _: "checkAuthenticationPassword",
                                    password: password.trim()
                                });
                                rd.close();
                            });
                            break;
                        case "authorizationStateReady":
                            console.log("✅ Авторизация успешна!");
                            break;
                        case "authorizationStateClosed":
                            console.log('Сессия закрыта');
                            process.exit();
                    }
                }
            })
            return client;
        },
        sendMsg: async function ({ users, text }) {
            const user_list = users.split(",");
            for (const user of user_list) {
                const chat = await client.invoke({
                    _: "searchPublicChat",
                    username: user.replace("@", "")
                })
                return await client.invoke({
                    _: 'sendMessage',
                    chat_id: chat.id,
                    input_message_content: {
                        _: 'inputMessageText',
                        text: {
                            _: "formattedText",
                            text: text,
                        }
                    }
                })
            }
        },
        sendFile: async function ({ files, users }) {
            const user_list = users.split(",");
            for (const user of user_list) {
                const chat = await client.invoke({
                    _: "searchPublicChat",
                    username: user.replace("@", "")
                })
                for (const [i, file] of files.entries()) {
                    await client.invoke({
                        _: 'sendMessage',
                        chat_id: chat.id,
                        input_message_content: {
                            _: 'inputMessageDocument',
                            document: {
                                _: 'inputFileLocal',
                                path: file.path
                            },
                            caption: {
                                _: 'formattedText',
                                text: i < 1 ? `Файл (${file.caption})` : null,
                            }
                        }
                    });
                }
            }
        }
    }
}