var express = require('express');
var router = express.Router();
var uuid = require('uuid');
var cache = require('memory-cache');
var queue = require('express-queue');

let requestNum = 0;
let cacheMissNum = 0;

router.get('/', queue({ activeLimit: 1, queuedLimit: -1 }), (req, res) => {
  requestNum++;
  let cachedDevice = cache.get('device');
  if (cachedDevice) {
    res.send(cachedDevice);
    return;
  }
  cacheMissNum++;
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
  var connectionString = process.env.IOTHUB_CONNECTION_STRING;
  if (!connectionString) {
    res.status(500).send('Connection string is not specified.');
    return;
  }
  let m = connectionString.match(/HostName=([^\.]*)\.azure\-devices\.net/);
  let iothubName;
  if (m) {
    iothubName = m[1];
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
      let result = {
        registered: deviceList.length,
        connected: connectedNum,
        iothub: iothubName,
      };
      cache.put('device', result, 5000);
      res.send(result);
    }
  });
});

router.get('/debug', (req,res)=>{
  res.json({
    requestNum,
    cacheMissNum,
  });
});

module.exports = router