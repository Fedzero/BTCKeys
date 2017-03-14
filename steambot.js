/**
 * Created by UKF on 12/4/16.
 * Current version 2.05 - Last updated: 14-03-2017
 */

const config = require("./config.js");
const mysql = require('mysql');
const request = require("request");
const dateFormat = require('dateformat');
const SteamTotp = require('steam-totp');
const SteamUser = require('steam-user');
const SteamCommunity = require('steamcommunity');
const TradeOfferManager = require('steam-tradeoffer-manager');
const client = new SteamUser();
const community = new SteamCommunity();
const fs = require('fs');
const server = require('socket.io-client')('http://localhost:3100');
const convertUrl = "http://api.fixer.io/latest?base=USD";

const EUR_SIGN = "\u{20AC}";
let enableEUR = false;
let KEYS_LIMIT = 1000;
let EUR = null;
let last_btc_update = null;

let botVersion = 2.05;
let min_amountToSell = 3;

let btc_price = 0;
let bot_capacity = 0;
let blockchain_balance = 0;

let selling_key_price_usd = 2.18;
let buying_key_price_usd = 2.15;

let selling_key_price_eur = 0;
let buying_key_price_eur = 0;

let selling_key_price_btc = 0;
let buying_key_price_btc = 0;

let keysInTrade = 0;
let keysStock = 0;

let prices_buying = {};

const manager = new TradeOfferManager({
    "steam": client,
    "domain": config.steam.domain,
    "language": "en"
});

const logOnOptions = {
    "accountName": config.steam.username,
    "password": config.steam.password,
    "twoFactorCode": SteamTotp.generateAuthCode(config.steam.shared_secret)
};

const connection = mysql.createConnection({
    host: config.server.dbhost,
    user: config.server.dbuser,
    password: config.server.dbpassword,
    database: config.server.dbname
});


function getUSDToEUR(callback) {
    request(convertUrl, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            let obj = JSON.parse(body);
            EUR = round(obj.rates['EUR'], 2);
            console.log("USD to EUR rate: " + EUR);
            callback(EUR);
        } else {
            callback(null);
        }
    });
}

const keysToAccept = [
    "Chroma 2 Case Key",
    "Huntsman Case Key",
    "Chroma Case Key",
    "eSports Key",
    "Winter Offensive Case Key",
    "Revolver Case Key",
    "Operation Vanguard Case Key",
    "Shadow Case Key",
    "Operation Wildfire Case Key",
    "Falchion Case Key",
    "Operation Breakout Case Key",
    "Chroma 3 Case Key",
    "CS:GO Case Key",
    "Operation Phoenix Case Key",
    "Gamma Case Key",
    "Gamma 2 Case Key",
    "Glove Case Key"
];

function round(value, decimals) {
    return Number(Math.round(value + 'e' + decimals) + 'e-' + decimals);
}

function getIntValue(value) {
    let int = parseInt(value);
    if (isNaN(value)) {
        return -1;
    } else {
        return int;
    }
}

client.logOn(logOnOptions);
client.on('loggedOn', function (details) {
    console.log("Logged into Steam as " + client.steamID.getSteam3RenderedID());
    client.setPersona(SteamUser.EPersonaState.Online);
    connection.connect(function (err) {
        if (err) {
            console.error('Error connecting: ' + err.stack);
            return;
        } else {
            console.log("Successfully connected to database.");
        }
    });
    getUSDToEUR(function (eur) {
        request("https://www.bitstamp.net/api/ticker/", function (error, response, body) {
            if (!error && response.statusCode == 200) {
                let obj = JSON.parse(body);
                btc_price = obj.last;

                let currentDate = new Date();
                last_btc_update = dateFormat(currentDate, "dd.mm.yyyy hh:MM:ss TT");

                initializePrices(function (err) {
                    if (!err) {
                        selling_key_price_eur = round(selling_key_price_usd * eur, 2);
                        buying_key_price_eur = round(buying_key_price_usd * eur, 2);

                        selling_key_price_btc = round(selling_key_price_usd / btc_price, 8);
                        buying_key_price_btc = round(buying_key_price_usd / btc_price, 8);

                        let btcInEUR = btc_price * eur;

                        if (enableEUR) {
                            console.log('Current BTC price: ' + btc_price + ' [USD] - ' + round(btcInEUR, 2) + ' [EUR]');
                            console.log('Selling price: ' + selling_key_price_btc + ' [BTC] - ' + selling_key_price_usd + ' [USD] - ' + selling_key_price_eur + ' [EUR]');
                            console.log('Buying price: ' + buying_key_price_btc + '[BTC] - ' + buying_key_price_usd + ' [USD] - ' + buying_key_price_eur + ' [EUR]');
                        } else {
                            console.log('Current BTC price: ' + btc_price + ' [USD]');
                            console.log('Selling price: ' + selling_key_price_btc + ' [BTC] - ' + selling_key_price_usd + ' [USD]');
                            console.log('Buying price: ' + buying_key_price_btc + '[BTC] - ' + buying_key_price_usd + ' [USD]');
                        }
                    } else {
                        console.log(err);
                    }
                });
            }
        });
    });

    if (config.bot.enableDevUpdates) {
        request(config.bot.developer_website + "bot_advanced/version.php?version=" + botVersion, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                let obj = JSON.parse(body);
                // console.log(obj);
                if (botVersion == obj.version) {
                    console.log('Bot version: ' + botVersion + " - Status: " + obj.status + " - Requires update: " + obj.requires_update + " - Last updated: " + obj.last_updated);
                } else {
                    console.log('Newer version available: ' + obj.version);
                    console.log('Bot version: ' + botVersion + " - Status: " + obj.status + " - Requires update: " + obj.requires_update + " - Last updated: " + obj.last_updated);
                }
            }
        });
    }

    getBalance(function (bal) {
        console.log("Blockchain wallet balance: " + bal);
        blockchain_balance = bal;
    });

});

client.on('error', function (e) {
    console.log(e);
});

client.on('webSession', function (sessionID, cookies) {
    manager.setCookies(cookies, function (err) {
        if (err) {
            console.log(err);
            process.exit(1);
            return;
        }
    });

    community.setCookies(cookies);
    community.chatLogon();
    community.startConfirmationChecker(config.steam.refreshInterval, config.steam.secret);
    if (config.social.hasToUpdateProfile) {
        updateProfile();
    }
});


let getCapacity = function (callback) {
    let lcapacity = 0;

    manager.getUserInventoryContents(client.steamID.getSteamID64(), 730, 2, true, function (err, inventory, currencies) {
        if (err) {
            console.log(err.message);
            callback(err.message, null);
        } else {
            for (let i = 0; i < inventory.length; i++) {
                if (keysToAccept.indexOf(inventory[i].name) >= 0) {
                    lcapacity++;
                }
            }
            console.log("Successfully initialized bot capacity: " + lcapacity);
            callback(null, lcapacity);
        }
    });
};

setTimeout(function () {
    getCapacity(function (err, capacity) {
        if (err) {
            console.log(err);
        } else {
            bot_capacity = capacity;
        }
    });
}, 10000);

const unicodeText = "Thank you for using YOUR_BOT_NAME!\n" +
    "Please join my group: " + config.steam.grouplink + "\n" +
    "\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\n" +
    "\u{2665}\u{2591}\u{2591}\u{2591}\u{2591}\u{2591}\u{2591}\u{2591}\u{2588}\u{2588}\u{2588}\u{2588}\u{2588}\u{2588}\u{2557}\u{2591}\u{2588}\u{2588}\u{2588}\u{2588}\u{2588}\u{2588}\u{2588}\u{2557}\u{2588}\u{2588}\u{2588}\u{2588}\u{2588}\u{2588}\u{2557}\u{2591}\u{2591}\u{2665}\n" +
    "\u{2665}\u{2591}\u{2591}\u{2588}\u{2588}\u{2557}\u{2591}\u{2591}\u{2588}\u{2588}\u{2554}\u{2550}\u{2550}\u{2588}\u{2588}\u{2557}\u{2588}\u{2588}\u{2554}\u{2550}\u{2550}\u{2550}\u{2550}\u{255D}\u{2588}\u{2588}\u{2554}\u{2550}\u{2550}\u{2588}\u{2588}\u{2557}\u{2591}\u{2665}\n" +
    "\u{2665}\u{2588}\u{2588}\u{2588}\u{2588}\u{2588}\u{2588}\u{2557}\u{2588}\u{2588}\u{2588}\u{2588}\u{2588}\u{2588}\u{2554}\u{255D}\u{2588}\u{2588}\u{2588}\u{2588}\u{2588}\u{2557}\u{2591}\u{2591}\u{2588}\u{2588}\u{2588}\u{2588}\u{2588}\u{2588}\u{2554}\u{255D}\u{2591}\u{2665}\n" +
    "\u{2665}\u{255A}\u{2550}\u{2588}\u{2588}\u{2554}\u{2550}\u{255D}\u{2588}\u{2588}\u{2554}\u{2550}\u{2550}\u{2588}\u{2588}\u{2557}\u{2588}\u{2588}\u{2554}\u{2550}\u{2550}\u{255D}\u{2591}\u{2591}\u{2588}\u{2588}\u{2554}\u{2550}\u{2550}\u{2550}\u{255D}\u{2591}\u{2591}\u{2665}\n" +
    "\u{2665}\u{2591}\u{2591}\u{255A}\u{2550}\u{255D}\u{2591}\u{2591}\u{2588}\u{2588}\u{2551}\u{2591}\u{2591}\u{2588}\u{2588}\u{2551}\u{2588}\u{2588}\u{2588}\u{2588}\u{2588}\u{2588}\u{2588}\u{2557}\u{2588}\u{2588}\u{2551}\u{2591}\u{2591}\u{2591}\u{2591}\u{2591}\u{2591}\u{2665}\n" +
    "\u{2665}\u{2591}\u{2591}\u{2591}\u{2591}\u{2591}\u{2591}\u{2591}\u{255A}\u{2550}\u{255D}\u{2591}\u{2591}\u{255A}\u{2550}\u{255D}\u{255A}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{255D}\u{255A}\u{2550}\u{255D}\u{2591}\u{2591}\u{2591}\u{2591}\u{2591}\u{2591}\u{2665}\n" +
    "\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}\n";


community.on('sessionExpired', function (err) {
    console.log('Session expired.');
    if (err) {
        if (err.message == "Not Logged In") {
            console.log("Trying the error login.");
            client.webLogOn();
            community.chatLogon();
        } else {
            console.log(err.message);
        }
    } else {
        console.log('Trying to re-login.');
        client.webLogOn();
    }
});

manager.on('newOffer', function (offer) {
    console.log("New offer #" + offer.id + " from " + offer.partner.getSteamID64() + " - itemsToGive: " + offer.itemsToGive.length + " - itemsToReceive: " + offer.itemsToReceive.length);
    console.log("Note: " + offer.message);

    offer.getUserDetails(function (err, me, them) {
        if (err) {
            console.log(err.message);
        } else {
            if (them.escrowDays > 0) {
                declineOffer(offer);
                client.chatMessage(offer.partner.getSteamID64(), "You have " + them.escrowDays + " escrow days left, please try again later.");
            } else {

                if (config.admins.indexOf(offer.partner.getSteamID64()) >= 0) {
                    if (offer.itemsToGive.length == 0 && offer.itemsToReceive.length > 0) {
                        offer.accept();
                    } else if (offer.itemsToGive.length > 0 && (offer.itemsToReceive.length == 0 || offer.itemsToReceive.length > 0)) {
                        offer.accept();
                        console.log("Successfully accepted and gave " + offer.itemsToGive.length + " keys to " + offer.partner.getSteamID64() + ".");
                        bot_capacity = bot_capacity - offer.itemsToGive.length;
                    }
                } else {

                    if (offer.itemsToGive.length == 0 && offer.itemsToReceive.length > 0) {
                        if (offer.itemsToReceive.length >= min_amountToSell) {
                            if (offer.message != "" && offer.message.length > 10 && offer.message != null && offer.message != undefined) {
                                if (getKeysToReceiveAmount(offer) == offer.itemsToReceive.length) {


                                    if (KEYS_LIMIT - (bot_capacity + offer.itemsToReceive.length) >= 0) {
                                        /*
                                         Gets the bot capacity left
                                         e.g: 1000 - 500 = 500 keys left to buy.
                                         */
                                        let total_value = 0;

                                        offer.itemsToReceive.forEach(function (item) {
                                            total_value += prices_buying[item.market_hash_name];
                                        });

                                        getBalance(function (bal) {
                                            blockchain_balance = bal;
                                            console.log("Checking balance before proceeding: " + blockchain_balance + " BTC.");
                                            setTimeout(function () {
                                                if (btc_price > 0) {
                                                    let send_total_value_btc = round(total_value / btc_price, 8);
                                                    console.log("Amount of BTC to send: " + send_total_value_btc + " for tradeid#" + offer.id);

                                                    if (blockchain_balance >= send_total_value_btc) {
                                                        console.log(blockchain_balance + " is >= " + send_total_value_btc + " => can proceed.");

                                                        offer.accept(function (err, status) {
                                                            if (err) {
                                                                setTimeout(function () {
                                                                    offer.accept();
                                                                }, 15000);
                                                            } else {
                                                                console.log("Offer accepted");
                                                            }
                                                        });

                                                        console.log("Trade#" + offer.id + " status: " + offer.state);
                                                        if (offer.state == 2) {
                                                            bot_capacity = bot_capacity + offer.itemsToReceive.length;
                                                            client.chatMessage(offer.partner.getSteamID64(), "Offer accepted, please wait while I validate the offer.");
                                                            insertBuying(offer.partner.getSteamID64(), offer.id, offer.itemsToReceive.length, offer.message, '', round(offer.itemsToReceive.length * buying_key_price_btc, 8), round(offer.itemsToReceive.length * buying_key_price_usd, 2), function () {
                                                                client.chatMessage(offer.partner.getSteamID64(), "I have received " + offer.itemsToReceive.length + " keys - offer #" + offer.id + "\nPlease allow up to 10-15 mins for the bot to send you the BTC amount, all entries are recorded.\nIn case you didn't receive your bitcoins within the next hour, please contact my owner.");
                                                            });

                                                        } else {

                                                        }
                                                    } else {

                                                        /*
                                                         Bot blockchain wallet doesn't have enough BTC.
                                                         */

                                                        console.log('Insufficient balance.');
                                                        declineOffer(offer);
                                                        client.chatMessage(offer.partner.getSteamID64(), '[WARNING] Offer declined, insufficient balance, I can only buy ' + Math.floor(blockchain_balance / buying_key_price_btc) + " keys.");
                                                    }
                                                }
                                            }, 3000);
                                        });
                                    } else {
                                        declineOffer(offer);
                                        client.chatMessage(offer.partner.getSteamID64(), "Bot can only buy " + (KEYS_LIMIT - bot_capacity) + " keys.");
                                    }


                                    /*
                                     Amount of keys != Amount of items to receive.
                                     */

                                } else {
                                    console.log(them.personaName + " - " + offer.partner.getSteamID64() + " - Amount of keys to receive isn't correct.");
                                    declineOffer(offer);
                                }

                                /*
                                 BTC address not found in the trade message.
                                 */

                            } else {
                                declineOffer(offer);
                                client.chatMessage(offer.partner.getSteamID64(), "[WARNING] Offer declined, make sure to put your BTC address in the trade message (note).");
                            }
                        } else {
                            declineOffer(offer);
                            client.chatMessage(offer.partner.getSteamID64(), "Minimum amount of keys to sell: " + min_amountToSell);
                        }

                    } else if (offer.itemsToGive.length > 0 && offer.itemsToReceive.length == 0) {


                        let total_value_usd = getKeysToGiveAmount(offer) * selling_key_price_usd;
                        let total_value_btc = round(getKeysToGiveAmount(offer) * selling_key_price_btc, 8);

                        if (offer.itemsToGive.length == getKeysToGiveAmount(offer)) {
                            client.chatMessage(offer.partner.getSteamID64(), "Analyzing trade and checking your BTC balance, please wait a moment.");
                            getUserAddress(offer.partner.getSteamID64(), function (address_found, addResp) {
                                /*
                                 Fetch balance of the user.
                                 */
                                checkBalance(address_found, function (confirmedBalance, unconfirmedBalance) {

                                    console.log(offer.partner.getSteamID64() + "'s balance: " + confirmedBalance + " => value of keys to purchase: " + total_value_btc);

                                    /*
                                     Check confirmed balance for the user.
                                     */

                                    if (confirmedBalance >= total_value_btc) {

                                        console.log(offer.partner.getSteamID64() + " has " + confirmedBalance + " BTC and wants to buy keys of value: " + total_value_btc + " BTC.");

                                        transfer(address_found, total_value_btc, function (btc_to, btc_amounts, btc_hash, btc_msg, btc_success) {
                                            insertSelling(offer.partner.getSteamID64(), offer.id, 'false', getKeysToGiveAmount(offer), total_value_btc, total_value_usd, address_found, btc_hash);

                                            offer.accept(function (err, status) {
                                                if (err) {
                                                    console.log(err.message);

                                                    setTimeout(function () {
                                                        offer.accept();
                                                    }, 15000);

                                                } else {
                                                }
                                            });

                                            console.log("Trade#" + offer.id + " status: " + offer.state);

                                            if (offer.state == 2) {
                                                client.chatMessage(offer.partner.getSteamID64(), "Transferring funds from your address " + address_found + " with the balance needed " + total_value_btc);
                                                bot_capacity = bot_capacity - offer.itemsToGive.length;

                                                confirmGive(offer.id, address_found, btc_hash, function () {
                                                    console.log("Confirmed offer #" + offer.id);
                                                    client.chatMessage(offer.partner.getSteamID64(), "Thank you for trading with us!\nPlease join our group: " + config.steam.grouplink + "  if you didn't join it yet.");

                                                    commentOnUserProfile(offer.partner.getSteamID64(), unicodeText);
                                                    community.checkConfirmations();
                                                });
                                            } else {

                                            }
                                        });
                                    } else {
                                        client.chatMessage(offer.partner.getSteamID64(), "Trade offer declined. You don't have enough BTC to buy " + offer.itemsToGive.length + " keys. You need to pay " + total_value_btc + " BTC to " + address_found);
                                        declineOffer(offer);
                                    }
                                });
                            });

                        } else {
                            console.log(them.personaName + " - " + offer.partner.getSteamID64() + " - Amount of keys to send isn't correct.");
                            declineOffer(offer);
                        }
                    } else {
                        client.chatMessage(offer.partner.getSteamID64(), "Please send a valid offer containing only keys.");
                        declineOffer(offer);
                    }
                }
            }
        }
    });
});


function refreshInformation() {
    let canBuyAmount = 0;

    getCapacity(function (err, capacity) {
        if (err) {
            console.log(err);
        } else {
            keysStock = capacity;
        }
    });
    /*
     Double timers added to avoid any conflicts.
     */

    setTimeout(function () {

        getBalance(function (myBalance) {
            canBuyAmount = Math.floor(myBalance / buying_key_price_btc);
            setTimeout(function () {
                if (enableEUR) {
                    client.gamesPlayed("[B: $" + buying_key_price_usd + "/" + EUR_SIGN + buying_key_price_eur + "] [S: $" + selling_key_price_usd + "/" + EUR_SIGN + selling_key_price_eur + "] [Keys " + keysStock + "/" + KEYS_LIMIT + "]");
                } else {
                    client.gamesPlayed("[B: $" + buying_key_price_usd + "] [S: $" + selling_key_price_usd + "] [Keys " + keysStock + "/" + KEYS_LIMIT + "]");
                }
            }, 3000);
        });

    }, 2000);

}

manager.on('receivedOfferChanged', function (offer, oldState) {
    console.log(`Offer #${offer.id} changed: ${TradeOfferManager.ETradeOfferState[oldState]} -> ${TradeOfferManager.ETradeOfferState[offer.state]}`);
    if (offer.state == TradeOfferManager.ETradeOfferState.Accepted) {

        updateBuying(offer.id, function () {
            console.log("We have successfully accepted " + offer.partner.getSteamID64() + "'s offer: #" + offer.id);
        });

        offer.getReceivedItems(function (err, items) {
            if (err) {
                console.log("Couldn't get received items: " + err);
            } else {
                let names = items.map(function (item) {
                    return item.name;
                });
                console.log("Received from " + offer.partner.getSteamID64() + ": " + names.join(', '));
            }
        });
    }
});


client.on('newItems', function (count) {
    console.log(count + " new items in our inventory");
});


client.on('friendMessage', function (steamID, message) {

    let stock = keysStock - keysInTrade;

    if (community.chatState == 3) {
        insertChat(steamID, message);
        console.log("Received a message from: " + steamID + " - " + message);
        // insertChat(SteamID, message);
        let messageArray = message.split(" ");
        // console.log(messageArray.length);

        if (messageArray.length == 3) {

            if (messageArray[0] === "!withdraw" || messageArray[0] === "withdraw") {
                if (!isNaN(messageArray[2])) {
                    getUserAddress(steamID, function (address_found, addResp) {
                        if (address_found != null) {
                            console.log("Address found.");
                            checkBalance(address_found, function (confirmedBalance, unconfirmedBalance) {
                                console.log("Checking user's balance.");
                                if (confirmedBalance >= messageArray[2]) {
                                    // console.log(confirmedBalance);
                                    withdraw(messageArray[1], address_found, messageArray[2], function (err, btc_to, btc_amounts, btc_hash, btc_msg, btc_success) {
                                        if (err) {
                                            console.log(err.message);
                                            client.chatMessage(steamID, err.message);
                                        } else {
                                            client.chatMessage(steamID, "You have successfully withdrawn: " + btc_amounts + " BTC.\n" +
                                                "TX hash: https://blockchain.info/tx/" + btc_hash + " [" + btc_success + "]");
                                        }
                                    })
                                } else {
                                    client.chatMessage(steamID, "BTC address: " + address_found + "\nConfirmed balance: " + confirmedBalance + " [BTC] - Unconfirmed balance: " + unconfirmedBalance + " [BTC]");
                                }
                            });
                        }
                    });
                }
            } else {

            }
        } else if (messageArray.length == 2) {
            if (messageArray[0] === "!buy" || messageArray[0] === "buy") {


                if (getIntValue(messageArray[1]) != -1 && getIntValue(messageArray[1]) > 0 && !isNaN(messageArray[1])) {
                    let value_btc = round(getIntValue(messageArray[1]) * selling_key_price_btc, 8);

                    getUserAddress(steamID, function (address_found, addResp) {
                        if (address_found != null) {
                            checkBalance(address_found, function (confirmedBalance, unconfirmedBalance) {
                                if (confirmedBalance >= value_btc) {
                                    client.chatMessage(steamID, "You can buy " + messageArray[1] + " keys with the BTC amount you have in your wallet address.\nYou can buy a total of " + Math.floor(confirmedBalance / selling_key_price_btc) + " keys with the BTC amount you have in your wallet address.");
                                } else {
                                    let btc_left = round(value_btc - confirmedBalance, 8);
                                    let valueNeededUsd = round(value_btc * btc_price, 2);
                                    let valueNeededUsdLeft = round(btc_left * btc_price, 2);

                                    if (enableEUR) {
                                        let valueNeededEur = round(valueNeededUsd * EUR, 2);
                                        let valueNeededEurLeft = round(valueNeededUsdLeft * EUR, 2);

                                        client.chatMessage(steamID, "To buy " + messageArray[1] + " keys, you need to have " + value_btc + " [BTC] | " + valueNeededUsd + " [$] | " + valueNeededEur + " [" + EUR_SIGN + "] . You don't have enough btc, you need to pay " + btc_left + " [BTC] | " + valueNeededUsdLeft + " [$] | " + valueNeededEurLeft + " [" + EUR_SIGN + "] to " + address_found);
                                    } else {
                                        client.chatMessage(steamID, "To buy " + messageArray[1] + " keys, you need to have " + value_btc + " [BTC] | " + valueNeededUsd + " [$] . You don't have enough btc, you need to pay " + btc_left + " [BTC] | " + valueNeededUsdLeft + " [$] to " + address_found);
                                    }
                                }
                            });
                        }
                    });


                } else {
                    client.chatMessage(steamID, "[ERROR] Enter a valid number.");
                }
            } else if (messageArray[0] === "!sell" || messageArray[0] === "sell") {

                if (getIntValue(messageArray[1]) != -1 && getIntValue(messageArray[1]) > 0 && !isNaN(messageArray[1])) {
                    let value_btc = round(getIntValue(messageArray[1]) * buying_key_price_btc, 8);
                    let valueUsd = round(value_btc * btc_price, 2);
                    if (enableEUR) {
                        let valueEur = round(valueUsd * EUR, 2);
                        client.chatMessage(steamID, "I will pay " + value_btc + " [BTC] | " + valueUsd + " [$] | " + valueEur + " [" + EUR_SIGN + "] for " + messageArray[1] + " keys.");
                    } else {
                        client.chatMessage(steamID, "I will pay " + value_btc + " [BTC] | " + valueUsd + " [$] for " + messageArray[1] + " keys.");
                    }
                } else {
                    client.chatMessage(steamID, "[ERROR] Enter a valid number.");
                }
            }
            else {
                client.chatMessage(steamID, "Enter !commands for a list of useful commands.");
            }
        } else {
            message = message.toLowerCase();
            switch (message) {
                case "!trade":
                case "trade":
                    let tradeMsg = "Trade - for skin trading you can contact my owner ( " + config.steam.ownerlink + " ) or just send me a trade offer ( " + config.steam.ownertradeofferlink + " )";
                    client.chatMessage(steamID, tradeMsg);
                    break;
                case "!version":
                case "version":
                    client.chatMessage(steamID, "Current version v" + botVersion);
                    break;
                case "!stock":
                case "stock":
                    client.chatMessage(steamID, "Keys in stock: " + stock);
                    break;
                case "!keysInfo":
                case "keysInfo":
                    client.chatMessage(steamID, "Keys in stock: " + keysStock);
                    client.chatMessage(steamID, "Keys in trade: " + keysInTrade);
                    client.chatMessage(steamID, "Keys in inventory: " + keysStock);
                    break;
                case "!help":
                case "help":
                    client.chatMessage(steamID, "In case something went wrong, please contact my owner -> " + config.steam.ownerlink);
                    break;
                case "!buy":
                case "buy":
                    let msgBuy = "1) Type buy [amount_of_keys] and bot will tell you price for keys. Example: buy 2.\n" +
                        "2) After your payment is confirmed, you can send me a trade offer " + config.steam.tradeofferlink + "and bot will automatically accept.\n" +
                        "If you wish to buy keys instantly, you need the send transaction with fee at least 0.00151 BTC (this value changes from time to time)";

                    client.chatMessage(steamID, msgBuy);
                    break;

                case "!sell":
                case "sell":
                    let msgSell = "1) Send me a trade offer " + config.steam.tradeofferlink + " with the keys you wish to sell and add your bitcoins address in the trade offer message.\n" +
                        "2) After the offer is accepted, bot will send bitcoins to your wallet\n";
                    client.chatMessage(steamID, msgSell);
                    break;
                case "!prices":
                case "prices":
                case "!price":
                case "price":
                    if (enableEUR) {
                        client.chatMessage(steamID, "Selling price: " + selling_key_price_btc + " [BTC] - " + selling_key_price_usd + " [USD] - " + selling_key_price_eur + " [EUR]\n");
                        client.chatMessage(steamID, "Buying price: " + buying_key_price_btc + " [BTC] - " + buying_key_price_usd + " [USD] - " + buying_key_price_eur + " [EUR]");
                    } else {
                        client.chatMessage(steamID, "Selling price: " + selling_key_price_btc + " [BTC] - " + selling_key_price_usd + " [USD]\n");
                        client.chatMessage(steamID, "Buying price: " + buying_key_price_btc + " [BTC] - " + buying_key_price_usd + " [USD]");
                    }
                    break;
                case "!rate":
                case "rate":
                case "!rates":
                case "rates":

                    if (enableEUR) {
                        client.chatMessage(steamID, "1 BTC = " + btc_price + " [USD] - " + round(btc_price * EUR, 2) + " [EUR] [Bitstamp]\n");
                        client.chatMessage(steamID, "Selling price: " + selling_key_price_btc + " [BTC] - " + selling_key_price_usd + " [USD] - " + selling_key_price_eur + " [EUR]\n");
                        client.chatMessage(steamID, "Buying price: " + buying_key_price_btc + " [BTC] - " + buying_key_price_usd + " [USD] - " + buying_key_price_eur + " [EUR]");
                    } else {
                        client.chatMessage(steamID, "1 BTC = " + btc_price + " [USD] [Bitstamp]\n");
                        client.chatMessage(steamID, "Selling price: " + selling_key_price_btc + " [BTC] - " + selling_key_price_usd + " [USD]\n");
                        client.chatMessage(steamID, "Buying price: " + buying_key_price_btc + " [BTC] - " + buying_key_price_usd + " [USD]");
                    }

                    break;
                case "!commands":
                case "!command":
                case "command":
                case "commands":
                    let commands = "Available commands:\n" +
                        "Trade - for skin trading information.\n" +
                        "Buy - shows instruction how to buy keys.\n" +
                        "Sell - shows instruction how to sell keys.\n" +
                        "Withdraw [address] [amount] - withdraws BTC from your balance on bot.\n" +
                        "Balance - shows your current BTC balance / deposit address.\n" +
                        "Rate - shows current BTC price in USD/EUR.\n" +
                        // "Prices - shows current buying and selling price.\n" +
                        "Help - FAQ\n" +
                        "Support - request to chat with the owner of the bot (must be online).\n";
                    client.chatMessage(steamID, commands);
                    break;
                case "!support":
                case "support":
                    if (config.admins.length > 0) {
                        config.admins.forEach(function (admin) {
                            client.chatMessage(admin, steamID + " is requesting support, please answer him or add him http://steamcommunity.com/profiles/" + steamID);
                        });
                        client.chatMessage(steamID, "Admins have been notified and will be ready to assist you as soon as possible.");
                    } else {
                        client.chatMessage(steamID, "Admins are not available.");
                    }
                    break;
                case "!owner":
                case "owner":
                    client.chatMessage(steamID, "My owner: " + config.steam.ownerlink);
                    break;
                case "!balance":
                case "balance":
                    getUserAddress(steamID, function (address_found, addResp) {
                        if (address_found != null && address_found != undefined && address_found != "") {
                            checkBalance(address_found, function (confirmedBalance, unconfirmedBalance) {
                                client.chatMessage(steamID, "You can deposit any amount to the following address: " + address_found + "\nConfirmed balance: " + confirmedBalance + " [BTC] - Unconfirmed balance: " + unconfirmedBalance + " [BTC]\n" +
                                    "You can buy " + Math.floor(confirmedBalance / selling_key_price_btc) + " keys with the BTC amount you have in your wallet address.");
                            });
                        }
                    });
                    break;
                case "!withdraw":
                case "withdraw":
                    client.chatMessage(steamID, "[ERROR] !withdraw BTC_ADDRESS BTC_AMOUNT");
                    break;
                default:
                    client.chatMessage(steamID, "Enter !commands for a list of useful commands.");
                    break;
            }
        }
    } else {
        community.chatLogon();
    }
});


function commentOnUserProfile(steamID, message) {
    community.postUserComment(steamID, message, function (err) {
        if (err) {
            console.log(err.message);
        } else {
            console.log("Successfully commented: " + message);
        }
    })
}


client.on('friendRelationship', function (steamID, relationship) {
    if (relationship == SteamUser.Steam.EFriendRelationship.RequestRecipient) {
        client.addFriend(steamID, function (err) {
            if (err) {
                console.log(err.message);
            } else {
                if (config.social.botIsMod) {
                    inviteToGroup(steamID, config.steam.groupid);
                }
                console.log('Successfully added ' + steamID);

                customerAvailable(steamID, function (availability) {
                    if (availability === true) {
                        getUserAddress(steamID, function (address_found, addResp) {
                            if (address_found == null) {
                                generateAddress(function (generated_address) {
                                    console.log('Successfully generated address: ' + generated_address + ' for ' + steamID + '.');
                                    updateAddress(steamID, generated_address);
                                    client.chatMessage(steamID, config.messages.welcome_back + "\nBot successfully generated a BTC address representing you balance: " + generated_address);
                                });
                            } else {
                                client.chatMessage(steamID, config.messages.welcome_back);
                            }
                        });
                    } else {
                        generateAddress(function (generated_address) {
                            insertCustomer(steamID, generated_address);
                            client.chatMessage(steamID, config.messages.greetings + "\n" + "Bot successfully generated a BTC address representing you balance: " + generated_address);
                            console.log("New customer: " + steamID + " - Successfully generated address: " + generated_address);
                        });
                    }
                });
            }
        });

    }
});

function getKeysToGiveAmount(offer) {
    let number = 0;
    for (let i = 0; i < offer.itemsToGive.length; i++) {
        if (offer.itemsToGive[i].appid == 730 && keysToAccept.indexOf(offer.itemsToGive[i].name) >= 0) {
            number++;
        } else {
        }
    }
    return number;
}


function getKeysToReceiveAmount(offer) {
    let number = 0;
    for (let i = 0; i < offer.itemsToReceive.length; i++) {
        if (offer.itemsToReceive[i].appid == 730 && keysToAccept.indexOf(offer.itemsToReceive[i].name) >= 0) {
            number++;
        } else {
        }
    }
    return number;
}


function declineOffer(offer) {
    offer.decline(function (err) {
        if (err) {
            if (err) {
                // console.log("Unable to decline offer: " + err.message);
            } else {
                console.log("Offer declined.");
            }
        }
    });
}

let customerAvailable = function (steamid64, callback) {
    let availablility = false;
    connection.query('SELECT * FROM customers WHERE steamid64 = "' + steamid64 + '"', function (err, results) {
        if (err) {
            throw err;
        } else {
            if (results.length == 0) {
                availablility = false;
            } else if (results.length == 1) {
                availablility = true;
            } else {
                availablility = false;
            }
        }
        callback(availablility);
    });
};

function insertCustomer(steamid64, gen_address) {
    let array = {
        steamid64: steamid64,
        btc_address: gen_address
    };

    connection.query('INSERT INTO customers SET ?', array, function (err, result) {
        if (err) {
            throw err;
        }
    });
}


function insertBuying(steamid, tradeid, keys_amount, btc_address, btc_hash, btc_amount, btc_amount_usd, callback) {

    let array = {
        steamid64: steamid,
        tradeid: tradeid,
        keys_amount: keys_amount,
        btc_address: btc_address,
        btc_hash: btc_hash,
        btc_amount: btc_amount,
        btc_amount_usd: btc_amount_usd,
        customer_paid: 'false',
        btc_sent: 'false'
    };

    connection.query('INSERT INTO transactions_buying SET ?', array, function (err, result) {
        if (err) {
            console.log(err.message);
        } else {
            console.log("Successfully inserted items: " + keys_amount + " keys for " + steamid + " tradeid#" + tradeid + " => " + btc_amount + " BTC <=> " + btc_amount_usd + " USD");
            callback();
        }
    });
}


function insertSelling(steamid, tradeid, paid, amount, btc_amount, btc_amount_usd, generated_address, btc_hash) {

    let array = {
        steamid64: steamid,
        tradeid: tradeid,
        we_paid: paid,
        keys_amount: amount,
        btc_address: generated_address,
        btc_hash: btc_hash,
        btc_amount: btc_amount,
        btc_amount_usd: btc_amount_usd,
    };

    connection.query('INSERT INTO transactions_selling SET ?', array, function (err, result) {
        if (err) {
            throw err;
        }

    });
}

function confirmFinalReceiving() {
    // console.log("Checking if payments were sent for all users.");
    connection.query('SELECT * FROM transactions_buying WHERE btc_sent = "false" AND customer_paid = "true"', function (err, results) {
        if (err) {
            throw err;
        } else {
            if (results.length > 0) {
                results.forEach(function (purchase) {
                    setTimeout(function () {
                        console.log("Making payment for address: " + purchase.btc_address + " - amount: " + purchase.btc_amount + " BTC.");
                        makePayment(purchase.btc_address, purchase.btc_amount, function (btc_to, btc_amounts, btc_hash, btc_msg, btc_success) {
                            console.log("Successfully sent " + btc_amounts + " to " + purchase.steamid64 + ": " + btc_msg + " => Hash: " + btc_hash + " => Success: " + btc_success);
                            client.chatMessage(purchase.steamid64, btc_msg + " to " + btc_to + "\nHash: " + btc_hash + "\nTrack the transaction: https://blockchain.info/tx/" + btc_hash);

                            /*
                             Update database record for the user => amount of BTC sent.
                             */
                            commentOnUserProfile(purchase.steamid64, unicodeText);
                            connection.query('UPDATE transactions_buying SET btc_sent = ?, btc_hash = ? WHERE tradeid = ? AND keys_amount = ?', ["true", btc_hash, purchase.tradeid, purchase.keys_amount], function (err, results) {
                                console.log("Updated final receiving record for tradeid#" + purchase.tradeid);
                            });
                        });
                    });
                }, 2000);
            }
        }
    });
}

function updateBuying(tradeid, callback) {
    connection.query('UPDATE transactions_buying SET customer_paid = "true" WHERE tradeid = ?', [tradeid], function (err, results) {
        if (err) {
            console.log(err.message);
        } else {
            callback();
        }
    });
}

function confirmGive(tradeid, btc_address, btc_hash, callback) {
    connection.query('UPDATE transactions_selling SET we_paid = "true", btc_hash = ? WHERE tradeid = ? AND btc_address = ?', [btc_hash, tradeid, btc_address], function (err, results) {
        if (err) {
            console.log(err.message);
        } else {
            callback();
        }
    });
}


function inviteToGroup(steamid, groupid) {
    community.inviteUserToGroup(steamid, groupid, function (err) {
        if (!err) {
            console.log("Successfully invited " + steamid + " to our group.")
        } else {
        }
    })
}


// setTimeout(function () {
//     community.getSteamGroup('gh0stdev', function (err, group) {
//         if (err) {
//             console.log(err.message);
//         } else {
//             console.log("Fetching group data:");
//         }
//     });
// }, 5000);

function insertChat(steamid64, message) {
    let array = {
        steamid64: steamid64,
        message: message,
    };
    connection.query('INSERT INTO chat_logs SET ?', array, function (err, result) {
        if (err) {
            throw err;
        }
    });
}

/*
 Database updaters
 */

function updateAddress(steamid64, address) {
    connection.query('UPDATE customers SET btc_address = ? WHERE steamid64 = ?', [address, steamid64], function (err, results) {
    });
}

let updateProfile = function () {
    setTimeout(function () {

        let profileSummary = "[h1]Hello I am just an automated bot for buying and selling keys via Bitcoins.[/h1]\n\n" +

            "[h1]Current prices:[/h1]\n";

        if (enableEUR) {
            profileSummary += "Buying keys for: [b]$" + buying_key_price_usd + "[/b] [b]" + EUR_SIGN + buying_key_price_eur + "[/b] (" + buying_key_price_btc + " BTC)*\n" +
                "Selling keys for: [b]$" + selling_key_price_usd + "[/b] [b]" + EUR_SIGN + selling_key_price_eur + "[/b] (" + selling_key_price_btc + " BTC)*\n" +
                "Current BTC rate: [b]$" + btc_price + "[/b] [b]" + EUR_SIGN + round(btc_price * EUR, 2) + "[/b]\n";
        } else {
            profileSummary += "Buying keys for: [b]$" + buying_key_price_usd + "[/b] (" + buying_key_price_btc + " BTC)*\n" +
                "Selling keys for: [b]$" + selling_key_price_usd + "[/b] (" + selling_key_price_btc + " BTC)*\n" +
                "Current BTC rate: [b]$" + btc_price + "[/b]\n";
        }

        profileSummary +=
            "Last update: [b]" + last_btc_update + "[/b]\n\n" +

            //    "[i]* Prices for CS:GO Case Key,eSports Key are $0.02 lower[/i]\n\n" +

            "[h1]How to sell keys to me:[/h1]\n" +
            "1) Add me as a friend\n" +
            "2) Type sell [amount_of_keys] and I will tell you how much BTC will you receive for specified amount of keys\n" +
            "3) Send me trade offer with the keys you wish to sell with your bitcoin address in the [url=" + config.steam.tradeofferlink + "]trade offer[/url] message\n" +
            "4) After the offer is accepted, bot will send bitcoins to your wallet\n\n" +

            "[h1]How to buy keys from me:[/h1]\n" +
            "1) Add me as a friend\n" +
            "2) Type buy [amount_of_keys] and I will tell you the current price for specified keys\n" +
            "3) Please deposit the specified amount of Bitcoins to your deposit wallet\n" +
            "4) After your balance is confirmed, feel free to send me [url=" + config.steam.tradeofferlink + "]trade offer[/url]and bot will automatically accept\n\n" +

            "[h1]NOTE: It's recommended to deposit slightly more BTC as rate always changes and you may not have enough until it gets 1 confirmation. Also, if your offer went unavailable, feel free to resend. If you wish to withdraw your unused funds from your wallet, type withdraw [address] [amount].[/h1]\n\n" +

            "[h1]Chat commands:[/h1]\n" +
            "[b]rate[/b] - checks the current BTC/USD rate\n" +
            "[b]prices[/b] - shows current buying and selling price\n" +
            "[b]balance[/b] - shows your current BTC balance\n" +
            "[b]buy[/b] - shows instruction how to buy keys\n" +
            "[b]sell[/b] - shows instruction how to sell keys\n" +
            "[b]buy [amount][/b] - shows price for specified amount of keys\n" +
            "[b]sell [amount][/b] - shows how much bot pays for specified amount of keys\n" +
            "[b]withdraw [address] [amount][/b] - withdraws BTC from your balance on bot\n" +
            "[b]help[/b] - FAQ\n" +
            "[b]support[/b] - request to chat with the owner of the bot (must be online)\n";

        community.editProfile({summary: profileSummary}, function (err) {
            if (err) {
                console.log(err.message);
            } else {
                console.log("Successfully updated profile summary.");
            }
        });
    }, 10000);
};

/*
 Database getters
 */


let getUserAddress = function (steamid64, callback) {
    let sql = 'SELECT * FROM customers WHERE steamid64 = "' + steamid64 + '"';
    let address_found = null;
    let addResp = null;
    connection.query(sql, function (err, results) {
        if (err) {
            throw err;
        } else {
            if (results.length == 0) {
                address_found = null;
                addResp = "Address not found, has to create a new one for " + steamid64;
            } else if (results.length == 1) {
                if (results[0] != null) {
                    address_found = results[0].btc_address;
                    addResp = "Address found for " + steamid64;
                } else {
                    address_found = null;
                    addResp = "Field available, but no address found for " + steamid64;
                }
            } else {
                address_found = null;
                addResp = "Duplicate found for " + steamid64;
            }
        }
        callback(address_found, addResp);
    });
};

/*
 Prices related
 */


let initializePrices = function (callback) {
    if (fs.existsSync(__dirname + "/prices.json")) {

        fs.readFile(__dirname + "/prices.json", 'utf8', (err, data) => {
            if (err) {
                callback(err.message);
                return;
            } else {
                let obj = JSON.parse(data);
                if (obj != null) {
                    for (let key_name in obj.buying) {
                        prices_buying[key_name] = obj.buying[key_name];
                    }
                    callback(null);
                }
            }
        });
    }
};

/*
 Bitcoins related
 */

let getBalance = function (callback) {
    request(config.btc_blockchain.base_url + config.btc_blockchain.guid + "/address_balance?password=" + config.btc_blockchain.main_password + "&address=" + config.btc_blockchain.static_address, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            let obj = JSON.parse(body);
            let balance = (obj.balance) / 100000000;
            callback(balance);
        }
    });
};

let generateAddress = function (callback) {
    request("http://localhost:3000/merchant/" + config.btc_blockchain.guid + "/new_address?password=" + config.btc_blockchain.main_password, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            // console.log(body);
            let obj = JSON.parse(body);
            let address = obj.address;
            if (address != null) {
                callback(address);
                server.emit('pushAddress', address);
            }
        }
    });
};

let makePayment = function (recipient, btc_amount, callback) {
    let satoshi = 100000000;
    let fee = calculateFee(btc_amount);
    btc_amount = Math.floor(btc_amount * satoshi) - fee;
    console.log("BTC amount: " + btc_amount + " - fee: " + fee);
    request("http://localhost:3000/merchant/" + config.btc_blockchain.guid + "/payment?api_code=" + config.btc_blockchain.api_key + "&to=" + recipient + "&amount=" + btc_amount + "&password=" + config.btc_blockchain.main_password + "&from=" + config.btc_blockchain.static_address + "&fee=" + fee, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            let obj = JSON.parse(body);
            let btc_to = obj.to[0];
            let btc_amounts = obj.amounts[0] / satoshi;
            let btc_hash = obj.tx_hash;
            let btc_msg = obj.message;
            let btc_success = obj.success;
            if (btc_to != null && btc_amounts != null && btc_hash != null && btc_msg != null && btc_success != null) {
                callback(btc_to, btc_amounts, btc_hash, btc_msg, btc_success);
            } else {
                console.log("Make payment error: " + body);
            }
        }
    });
};

let transfer = function (fromAcc, btc_amount, callback) {
    let satoshi = 100000000;
    btc_amount = Math.floor(btc_amount * satoshi) - 15000;
    request("http://localhost:3000/merchant/" + config.btc_blockchain.guid + "/payment?api_code=" + config.btc_blockchain.api_key + "&to=" + config.btc_blockchain.static_address + "&amount=" + btc_amount + "&password=" + config.btc_blockchain.main_password + "&from=" + fromAcc + "&fee=15000", function (error, response, body) {
        if (!error && response.statusCode == 200) {
            let obj = JSON.parse(body);
            let btc_to = obj.to[0];
            // console.log(obj);
            let btc_amounts = obj.amounts[0] / satoshi;
            let btc_hash = obj.tx_hash;
            let btc_msg = obj.message;
            let btc_success = obj.success;
            if (btc_to != null && btc_amounts != null && btc_hash != null && btc_msg != null && btc_success != null) {
                console.log("Successfully transferred funds from " + fromAcc + " to " + btc_to + " with the hash: " + btc_hash);
                callback(btc_to, btc_amounts, btc_hash, btc_msg, btc_success);
            } else {
                console.log("Transfer error: " + body);
            }
        }
    });
};

let withdraw = function (recipient, fromAcc, btc_amount, callback) {
    let satoshi = 100000000;
    let fee = calculateFee(btc_amount);
    btc_amount = Math.floor(btc_amount * satoshi) - fee;
    request("http://localhost:3000/merchant/" + config.btc_blockchain.guid + "/payment?api_code=" + config.btc_blockchain.api_key + "&to=" + recipient + "&amount=" + btc_amount + "&password=" + config.btc_blockchain.main_password + "&from=" + fromAcc + "&fee=" + fee, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            let obj = JSON.parse(body);
            let btc_to = obj.to[0];
            // console.log(obj);
            let btc_amounts = obj.amounts[0] / satoshi;
            let btc_hash = obj.tx_hash;
            let btc_msg = obj.message;
            let btc_success = obj.success;
            if (btc_to != null && btc_amounts != null && btc_hash != null && btc_msg != null && btc_success != null) {
                callback(null, btc_to, btc_amounts, btc_hash, btc_msg, btc_success);
            } else {
                console.log("Withdraw error: " + body);
                callback(new Error(body), btc_to, btc_amounts, null, null, null);
            }
        }
    });
};

let requestBlockCount = function (callback) {
    request("https://blockchain.info/q/getblockcount", function (error, response, body) {
        if (!error && response.statusCode == 200) {
            let block_count = null;
            block_count = JSON.parse(body);
            callback(block_count);
        }
    });
};

function checkBalance(address, callback) {

    requestBlockCount(function (block_count) {
        // console.log("Current block: " + block_count);

        request("https://blockchain.info/rawaddr/" + address, function (error, response, body) {
            if (!error && response.statusCode == 200) {

                let obj = JSON.parse(body);
                let transactions = obj.txs;
                let confirmed_balance = 0;
                let unconfirmed_balance = 0;

                setTimeout(function () {
                    if (transactions != null && transactions != undefined) {
                        transactions.forEach(function (transaction) {

                            let block_height = transaction.block_height;
                            let inputs = transaction.inputs;
                            let outputs = transaction.out;
                            let confirmations = block_count - block_height + 1;

                            if (confirmations >= config.btc_blockchain.required_confirmations) {
                                inputs.forEach(function (input) {
                                    let prevOut = input.prev_out;
                                    if (prevOut.addr == address && prevOut.spent == false) {
                                        // console.log(prevOut.addr + " " + prevOut.value + " " + prevOut.spent);
                                        confirmed_balance = confirmed_balance + prevOut.value;
                                    }
                                });

                                outputs.forEach(function (output) {
                                    if (output.addr == address && output.spent == false) {
                                        // console.log(output.addr + " " + output.value + " " + output.spent);
                                        confirmed_balance = confirmed_balance + output.value;
                                    }
                                });


                            } else {
                                inputs.forEach(function (input) {
                                    let prevOut = input.prev_out;
                                    if (prevOut.addr == address && prevOut.spent == false) {
                                        // console.log(prevOut.addr + " " + prevOut.value + " " + prevOut.spent);
                                        unconfirmed_balance = unconfirmed_balance + prevOut.value;
                                    }
                                });
                                outputs.forEach(function (output) {
                                    if (output.addr == address && output.spent == false) {
                                        // console.log(output.addr + " " + output.value + " " + output.spent);
                                        unconfirmed_balance = unconfirmed_balance + output.value;
                                    }
                                });
                            }
                        });

                        // console.log("Address: " + address + " - Confirmed balance: " + confirmed_balance + " - Unconfirmed balance: " + unconfirmed_balance);
                        callback(confirmed_balance / 100000000, unconfirmed_balance / 100000000);
                    }
                }, 2500);
            }

        });

    });
}


setInterval(function () {
    request("https://www.bitstamp.net/api/ticker/", function (error, response, body) {
        if (!error && response.statusCode == 200) {
            let obj = JSON.parse(body);
            btc_price = obj.last;
            if (config.social.hasToUpdateProfile) {
                let currentDate = new Date();
                last_btc_update = dateFormat(currentDate, "dd.mm.yyyy hh:MM:ss TT");
                updateProfile();
            }
            selling_key_price_btc = round(selling_key_price_usd / btc_price, 8);
            buying_key_price_btc = round(buying_key_price_usd / btc_price, 8);
        }
    });
    /*
     One hour interval
     */
}, 1000 * 60 * 60);

setTimeout(function () {

    let myAvailableFriends = client.myFriends;

    let tempFriends = [];
    for (let steamid in myAvailableFriends) {
        tempFriends.push(steamid);
    }

    tempFriends.forEach(function (steamid) {
        customerAvailable(steamid, function (availability) {
            if (availability === true) {
                getUserAddress(steamid, function (address_found, addResp) {
                    if (address_found == null) {
                        generateAddress(function (generated_address) {
                            updateAddress(steamid, generated_address);
                        });
                    }
                });


            } else {
                generateAddress(function (generated_address) {
                    insertCustomer(steamid, generated_address);
                    console.log("New customer: " + steamid + " - Successfully generated address: " + generated_address);
                });
            }
        });
    });
}, 10000);


function calculateFee(btcInput) {
    let satoshi = 100000000;

    let a = Math.floor(btcInput * satoshi);
    let b = Math.floor(buying_key_price_btc * satoshi);

    /*
     a = btc input * satoshi
     b = key price * satoshi
     b * x = amount of keys.
     */

    if (a >= b && a <= 5 * b) {
        return 20000;
    } else if (a > b * 5 && a <= 10 * b) {
        return 40000;
    } else if (a > b * 10 && a <= 20 * b) {
        return 50000;
    } else if (a > b * 20 && a <= 50 * b) {
        return 60000;
    } else if (a > b * 50 && a <= 75 * b) {
        return 75000;
    } else if (a > b * 100 && a <= 250 * b) {
        return 80000;
    } else if (a > b * 250 && a <= 500 * b) {
        return 90000;
    } else if (a > b * 500 && a <= 750 * b) {
        return 100000;
    } else if (a > b * 750 && a <= 1000 * b) {
        return 125000;
    } else if (a > b * 1000) {
        return 150000;
    }
}

setInterval(function () {
    refreshInformation();

}, config.steam.refreshInterval);

setInterval(function () {
    initializePrices(function (err) {
        if (err) {
            console.log(err);
        }
    });


    confirmFinalReceiving();
    /*
     5 seconds.
     */
}, 20000);


setInterval(function () {
    connection.query("SELECT 1");
    /*
     10 seconds.
     */
}, 10000);


server.on('notifyUser', function (obj) {
    if (obj.steamid != null && obj.steamid != undefined) {
        console.log("Notifying user: " + obj.steamid + ": " + obj.message);
        client.chatMessage(obj.steamid, obj.message);
    }
});