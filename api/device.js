var express = require('express');
var router = express.Router();
var uuid = require('uuid');
var Util = require('../util/util');

var device = express();
router.get('/', (req, res) => {
    var connectionString = Util.getConnectionString();
    if (!connectionString) {
        res.sendStatus(400);
    }
    var Registry = require('azure-iothub').Registry.fromConnectionString(connectionString);
    Registry.list((err, deviceList) => {
        if (err) {
            res.status(500).send('Could not trigger job: ' + err.message);
        } else {
            var connectedNum = 0;
            deviceList.forEach((device) => {
                if (device.connectionState === "Connected") connectedNum++;
            });
            res.send({
                registered: deviceList.length,
                connected: connectedNum
            });
        }
    });
});

module.exports = router