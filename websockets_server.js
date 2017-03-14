/**
 * Created by UKF on 2/14/17.
 */

const WebSocket = require('ws');
const ws = new WebSocket('wss://ws.blockchain.info/inv');
const config = require("./config.js");
const mysql = require('mysql');

const Server = require('socket.io');
const io = new Server();

const connection = mysql.createConnection({
    host: config.server.dbhost,
    user: config.server.dbuser,
    password: config.server.dbpassword,
    database: config.server.dbname
});

let addressesToTrack = [];

io.listen(3100);

let getSteamId = function (address, callback) {
    let sql = 'SELECT steamid64 FROM customers WHERE btc_address = "' + address + '"';
    connection.query(sql, function (err, results) {
        if (err) {
            throw err;
        } else {
            if (results.length > 0) {
                callback(results[0].steamid64);
            } else {
                callback(null);
            }
        }
    });
};

let fetchAllAddress = function (callback) {
    let sql = 'SELECT btc_address FROM customers WHERE btc_address IS NOT NULL';
    connection.query(sql, function (err, results) {
        if (err) {
            throw err;
        } else {
            if (results.length > 0) {
                callback(results);
            } else {
                callback(null);
            }
        }
    });
};

io.on('connection', function (socket) {
    console.log('Bot successfully connected to our websockets server.');

    socket.on('pushAddress', function (address) {
        try {
            console.log("Trying to open websocket for an address.");
            openWebsocketAddress(address);
        } catch (err) {

        }
    });

});


function openWebsocketAddress(address) {
    console.log("Opening web socket for address: " + address);
    ws.send('{"op":"addr_sub", "addr":"' + address + '"}', function (error) {
        if (!error) {
            console.log("Successfully opened websockets for " + address);
        }
    });
}

ws.on('open', function open() {

    let addresses = [];

    setTimeout(function () {

        fetchAllAddress(function (data) {
            console.log("Initial - Opening websockets.");
            if (data != null) {
                data.forEach(function (record) {
                    addresses.push(record.btc_address);
                });
            }

            let i = 0;

            while (i < addresses.length) {
                openWebsocketAddress(addresses[i]);
                i++;
            }
        });

        ws.send('{"op":"blocks_sub"}', function (error) {
            if (!error) {
                console.log("Successfully subscribed to the blocks.");
            }
        });

        ws.send('{"op":"ping"}', function (error) {
            if (!error) {
                console.log("Successfully pinged.");
            }
        });
    }, 3000);

    setInterval(function () {
        ws.send('{"op":"ping"}', function (error) {
            if (!error) {
                console.log("Successfully pinged after 25 seconds.");
            }
        });
    }, 25 * 1000);

});


function removeAddress(tx_index) {
    let tempArray = [];
    for (let i = 0; i < addressesToTrack.length; i++) {
        if (addressesToTrack[i].tx_index != null && addressesToTrack[i].tx_index != tx_index) {
            let objTemp = {
                address: addressesToTrack[i].address,
                tx_index: addressesToTrack[i].tx_index,
            };
            tempArray.push(objTemp);
        }
    }
    addressesToTrack = tempArray;
}

ws.on('message', function incoming(data, flags) {
    let satoshi = 100000000;
    let obj = JSON.parse(data);

    if (obj.op == "utx") {

        // console.log(data);
        let address = obj.x.out[0].addr;
        let amount = obj.x.out[0].value;
        let amount_calculated = round((amount / satoshi), 8);
        let tx_index = obj.x.tx_index;
        let tx_hash = obj.x.hash;

        getSteamId(address, function (steamid) {
            io.emit('notifyUser', {
                steamid: steamid,
                message: "I have received " + amount_calculated + " BTC and waiting for 1 confirmation.\n" +
                "You will be notified once your BTC have confirmed.\n" +
                "Track your transaction: https://blockchain.info/tx/" + tx_hash
            });
        });

        console.log("Received payment: " + amount_calculated + " BTC on the following address: " + address);
        let objtrack = {
            address: address,
            tx_index: tx_index,
            confirmations: 0
        };

        addressesToTrack.push(objtrack);
    } else if (obj.op == "block") {
        /*
         Tracking blocks and indexes.
         */

        let blockIndex = obj.x.blockIndex;
        let txIndexes = obj.x.txIndexes;
        console.log("New block appeared - block #" + blockIndex);
        addressesToTrack.forEach(function (addressToTrack) {
            if (txIndexes.indexOf(addressToTrack.tx_index) >= 0) {
                console.log("Block #" + blockIndex + " contains the following address: " + addressToTrack.address);
                addressToTrack.confirmations++;
                console.log("Address: " + addressToTrack.address + " - tx_index: " + addressToTrack.tx_index + " - confirmations: " + addressToTrack.confirmations);
                getSteamId(addressToTrack.address, function (steamid) {
                    io.emit('notifyUser', {
                        steamid: steamid,
                        message: "Your bitcoins have been confirmed."
                    });
                    removeAddress(addressToTrack.tx_index);
                });
            }
        });

    } else if (obj.op == "pong") {
        // console.log(data);
    }

});


function round(value, decimals) {
    return Number(Math.round(value + 'e' + decimals) + 'e-' + decimals);
}

setInterval(function () {
    connection.query("SELECT 1");
}, 5000);