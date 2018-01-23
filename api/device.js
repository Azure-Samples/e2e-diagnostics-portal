var express = require('express');
var router = express.Router();
var uuid = require('uuid');
var apicache = require('apicache');
// var Util = require('../util/util');

var device = express();
router.get('/', apicache.middleware('2 seconds'), (req, res) => {
  if (process.env.EXPIRE) {
    let expiration = process.env.EXPIRE;
    let initDate = req.query.init;
    if (!initDate || initDate < expiration) {
      res.json({
        registered: 0,
        connected: 0,
        error: "API request expired",
      });
      return;
    }
  }
  var connectionString = 'HostName=E2Ediagnostics.azure-devices.net;SharedAccessKeyName=iothubowner;SharedAccessKey=JQPTdBXSHrVWjQSOIEf1nBVG1uHtDL9f7dEzVcdoyTM=';
  if (!connectionString) {
    res.sendStatus(400);
    return;
  }
  var Registry = require('azure-iothub').Registry.fromConnectionString(connectionString);
  Registry.list((err, deviceList) => {
    if (err) {
      res.status(500).send('Could not trigger job: ' + err.message);
      return;
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