/**
 * Created by UKF on 12/20/16.
 */


const config = {
    "bot": {
        "developer": "lebgh0st",
        "developer_website": "http://hassanjawhar.com/",
        "github": "https://github.com/hassanjawhar",
        "enableDevUpdates": false, //Keep it disabled until I take my server up.
    },

    "btc_blockchain": {
        "guid": "",
        "api_key": "",
        "xpub": "",
        "main_password": "",
        "static_address": "",
        "required_confirmations": 1,
        "base_url": "http://localhost:3000/merchant/",
        "localhost": "localhost:3000"
    },

    "steam": {
        "username": "",
        "password": "",
        "shared_secret": "",
        "secret": "",
        "domain": "",
        "refreshInterval": 60000,
        "ownerlink": "",
        "ownertradeofferlink": "",
        "groupid": "",
        "grouplink": "",
        "tradeofferlink": "",
    },

    "social": {
        "hasToUpdateProfile": false,
        "botIsMod": false
    },

    "server": {
        "dbhost": "",
        "dbuser": "",
        "dbpassword": "",
        "dbname": ""
    },

    "owner": {
        "steamid64": ""

    },

    "admins": [],


    "messages": {
        "greetings": "Welcome to BTCKeys CSGO Bot!\nUse !commands to see a variety of commands.",
        "welcome_back": "Welcome back and thank you for using our Bot!"
    }

};

module.exports = config;