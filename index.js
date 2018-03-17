"use strict";

process.title = 'Heartbeat Websocket Server';

var Ant = require('ant-plus');
var WebsocketServer = require('websocket').server;
var Http = require('http');
var argv = require('yargs')
    .count('verbose')
    .alias('v', 'verbose')
    .alias('d', 'demo')    
    .alias('p', 'port')
    .argv;

// List of currently connected clients
var websocketClients = [];

var websocketServerPort = argv.port || 12021;

// The Garmin library used allows a debug level, which you can override here
var debugLevel = 0;
var verbosity = argv.verbose;

// Set up some utility log functions so we can enable.disable logs with a command line param
function logWarn() { console.warn.apply(console, arguments); }
function logInfo() { verbosity >= 1 && console.log.apply(console, arguments); }
function logDebug() { verbosity >= 2 && console.log.apply(console, arguments); }

/****
* Set up the http server, which is needed for the websocket server
*/
var httpServer = Http.createServer((request, response) => {
    // Not used.
});

// Start Listening
httpServer.listen(websocketServerPort, () => {
    logInfo('Server is listening on port: ', websocketServerPort);
});

/**
* Set up the web socket server.
*/
var socketServer = new WebsocketServer({
    httpServer: httpServer,
});

// Listen for web browsers, and send them heart rate data
socketServer.on('request', (request) => {
    logInfo('Connection from: ', request.origin);

    var conn = request.accept(null, request.origin);

    var index = websocketClients.push(conn) - 1;
    logInfo('Connection accepted');

    // Send the current heart rate data to the client
    sendHbData(conn);

    conn.on('close', (connection) => {
        logInfo('Client ' + connection.remoteAddress + ' disconnected');
        websocketClients.splice(index, 1);
    });
});

// Object to hold the most recent heart rate info
var recentHbData = {
    status: 'uninitialized',
    data: null,
    time: Date.now(),
};

// Update the in memory object with the latest from the monitor
// And send the latest data to every client
function updateHbData(status, data) {
    recentHbData = {
        status: status,
        data: data,
        time: Date.now(),
    };

    logDebug('Updated data: ', recentHbData);
    sendAllClientsHbData();
}

// Send the most recent HR data to a single client
function sendHbData(conn) {
    conn.sendUTF(JSON.stringify(recentHbData));
}

// Helper to send the most recent HR data to all connected clients
function sendAllClientsHbData() {
    for (var connId in websocketClients) {
        sendHbData(websocketClients[connId]);
    }
}

// When you don't have a HR monitor, this mocks sending data as if it were a connected HR monitor!
// Try it with $> node index.js -d -vv
if (argv.demo) {
    function getRandomHeartbeat() {
        var rand = Math.random();
        if (rand < .25) {
            updateHbData('live', {
                heartRate: recentHbData.data.heartRate - 1,
                beatCount: recentHbData.data.beatCount + 1,
                minRate: Math.min(recentHbData.data.heartRate - 1, recentHbData.data.minRate),
                maxRate: recentHbData.data.maxRate,
            });
        } else if (rand >= .75) {
            updateHbData('live', {
                heartRate: recentHbData.data.heartRate + 1,
                beatCount: recentHbData.data.beatCount + 1,
                minRate: recentHbData.data.minRate,
                maxRate: Math.max(recentHbData.data.maxRate, recentHbData.data.heartRate + 1),
            });
        } else {
            updateHbData('live', {
                heartRate: recentHbData.data.heartRate,
                beatCount: recentHbData.data.beatCount + 1,
                minRate: recentHbData.data.minRate,
                maxRate: recentHbData.data.maxRate,
            });
        }
    }

    updateHbData('live', {
        heartRate: 80,
        beatCount: 1,
        minRate: 80,
        maxRate: 80,
    });

    logInfo('Running demo mode. Consider using -vv to show output.');
    setInterval(getRandomHeartbeat, 750);
} else {
    // This is where I start hard coding things because, hey, it works on my machine!
    // TODO: Be resilient to even the most basic of errors...

    // Get the connected ANT+ USB Stick
    var stick = new Ant.GarminStick2(debugLevel);

    // And the first connected HR sensor on that stick
    // (Maybe there could be more than one? I don't have two devices to test with)
    var sensor1 = new Ant.HeartRateSensor(stick);

    // If the device returns a device ID, store it, so we can reference that device later
    var deviceId = 0;

    // Store the lowest and highest heart rate values we've seen this session. 
    // So I can play PUBG and be like, "WHOA MY HEARTRATE HIT 140?!" without having to go back
    // and view the recording
    var minRate = 1000;
    var maxRate = -1;

    logDebug(stick.is_present()); // For whatever reason, 'is_present' returns a big ol' JSON blob of useful debug info?
    
    // When there's new heartrate data, do some rad stuff with that data
    sensor1.on('hbdata', (data) => {
        if (!recentHbData.data || !recentHbData.data.beatCount || recentHbData.data.beatCount != data.BeatCount) {
            maxRate = Math.max(maxRate, data.ComputedHeartRate);
            minRate = Math.min(minRate, data.ComputedHeartRate);

            updateHbData('live', {
                heartRate: data.ComputedHeartRate,
                beatCount: data.BeatCount,
                minRate: minRate,
                maxRate: maxRate,
            });
        }

        // If it's the first time we've seen this device, flip to the correct device id
        // (I no longer remember why this is important)
        if (data.DeviceID !== 0 && deviceId === 0) {
            deviceId = data.DeviceID;
            logDebug('Flipping device ids to ', deviceId);
            sensor1.detach();
            sensor1.once('detached', function () {
                sensor1.attach(0, deviceId);
            });
        }
    });

    sensor1.on('attached', () => { logInfo('Sensor attached'); });
    sensor1.on('detached', () => { updateHbData('Detached', {}); logInfo('Sensor detached'); });

    stick.on('startup', () => {
        logInfo('Stick startup');
        // Attach the first sensor, which should be the heartbeat monitor?
        sensor1.attach(0, 0);
    });

    stick.on('shutdown', () => { logInfo('Stick shutdown'); });


    if (!stick.open()) {
        logWarn('Stick not found!');
    } else {
        logInfo('Stick opened');
    }
}