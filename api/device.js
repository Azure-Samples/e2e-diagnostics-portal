var express = require('express');
var router = express.Router();
var uuid = require('uuid');
var cache = require('memory-cache');
var queue = require('express-queue');

let requestNum = 0;
let cacheMissNum = 0;

const twinKey = "__e2e_diag_sample_rate";
const cacheSpanInSeconds = 10;

let Registry;

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
  if(!Registry) {
    Registry = require('azure-iothub').Registry.fromConnectionString(connectionString);
  }
  
  Registry.list((err, deviceList) => {
    if (err) {
      res.status(500).send('Could not trigger job: ' + err.message);
      return;
    } else {
      let deviceArray = [];
      let promises = [];
      deviceList.forEach((device) => {
        let d = {
          deviceId: device.deviceId,
          connected: device.connectionState === "Connected"
        }
        deviceArray.push(d);
        promises.push(getTwin(device.deviceId));
      });
      Promise.all(promises).then(results => {
        for(let twin of results) {
          let device = deviceArray.find(d=> d.deviceId === twin.deviceId);
          device.diagnosticDesired = twin.properties.desired[twinKey];
          device.diagnosticReported = twin.properties.reported[twinKey];
        }
        let result = {
          iothub: iothubName,
          devices: deviceArray
        };
        cache.put('device', result, cacheSpanInSeconds*1000);
        res.send(result);
      });
    }
  });
});

function getTwin(deviceId) {
  return new Promise((resolve,reject)=>{
    Registry.getTwin(deviceId, (err, twin)=>{
      if(err) {
        console.log(err)
        resolve();
      }else {
        resolve(twin);
      }
    });
  })
}

router.get('/debug', (req,res)=>{
  res.json({
    requestNum,
    cacheMissNum,
  });
});

module.exports = router