var express = require('express');
var router = express.Router();
var request = require('request');
var node_util = require('util');
var config = require('../config');
// var Util = require('../util/util');
var queue = require('express-queue');
var cache = require('memory-cache');
var storage = require('azure-storage');

let startOfTimestamp = new Date(config.startTime);
const kustoQuery = `customEvents | where name == 'E2EDiagnostics' and timestamp >= ago(1d) and todatetime(tostring(customDimensions['time'])) >= datetime('%s') and todatetime(tostring(customDimensions['time'])) <= datetime('%s') | project customDimensions`;
const restUrl = "https://api.applicationinsights.io/v1/apps/%s/query?timespan=P7D&query=%s";
const blobUrlTemplate = "resourceId=/SUBSCRIPTIONS/%s/RESOURCEGROUPS/%s/PROVIDERS/MICROSOFT.DEVICES/IOTHUBS/%s/y=%s/m=%s/d=%s/h=%s/m=00/PT1H.json";
const kustoUrlTemplate = 'https://analytics.applicationinsights.io/subscriptions/%s/resourcegroups/%s/components/%s?q=%s&apptype=other&timespan=P1D';
const containerName = 'insights-logs-e2ediagnostics';
const cacheSpanInMinutes = 1;
const defaultSpanForRefreshInMinutes = 20;

let requestNum = 0;
let cacheMissNum = 0;

const blobSvc = process.env.STORAGE_CONNECTION_STRING ? storage.createBlobService(process.env.STORAGE_CONNECTION_STRING) : null;
// var e2ePath = 'customEvents/E2EDIAGNOSTICS';
/* GET home page. */

// router.get('/kusto', function(req, res) {
//     res.redirect(node_util.format(kustoPath,process.env.RESOURCE_GROUP_NAME,process.env.APPLICATION_INSIGHTS_NAME));
// });

function handle(req, res, init) {
  if(!init) requestNum++;
  if (process.env.EXPIRE) {
    let expiration = process.env.EXPIRE.substring(1, 25);
    let initDate = req.query.init;
    if (!initDate || initDate < expiration) {
      res.json({
        value: [],
        error: "API request expired",
      });
      return;
    }
  }

  let span;
  if (init) {
    span = parseInt(req.query.span);
    if (span == undefined) {
      res.status(500).send("span is not provided");
      return;
    }
  } else {
    span = defaultSpanForRefreshInMinutes;
    let cachedData = cache.get('metric');
    if (cachedData) {
      res.send(cachedData);
      return;
    } else {
      cacheMissNum++;
    }
  }

  let appId = process.env.AI_APP_ID;
  let apiKey = process.env.AI_API_KEY;
  let storageCs = process.env.STORAGE_CONNECTION_STRING;
  let storageSubscriptionId = process.env.SUBSCRIPTION_ID;
  let storageResourceGroupName = process.env.RESOURCE_GROUP_NAME;
  let iothubConnectionString = process.env.IOTHUB_CONNECTION_STRING;
  if (!iothubConnectionString) {
    res.sendStatus(500).send('Connection string is not specified.');
    return;
  }
  let m = iothubConnectionString.match(/HostName=([^\.]*)\.azure\-devices\.net/);
  let storageIoTHubName;
  if (m) {
    storageIoTHubName = m[1];
  }else {
    res.sendStatus(500).send('IoT Hub Connection string format error.');
    return;
  }

  let callback = (source, err, data) => {
    if (err) {
      res.json({
        value: [],
        error: err.message,
        source,
      });
      return;
    } else {
      if (!init) {
        cache.put('metric', {
          value: data
        }, cacheSpanInMinutes * 60 * 1000);
      }
      res.json({
        value: data,
        source
      })
    }
  };

  if (appId && apiKey) {
    getAIData(appId, apiKey, span, callback.bind(null, 'ai'));
  } else if (storageCs && storageSubscriptionId && storageResourceGroupName && storageIoTHubName) {
    getStorageData(storageCs, storageSubscriptionId, storageResourceGroupName, storageIoTHubName, span, callback.bind(null, 'storage'));
  } else {
    res.status(500).send("You must provide at least one of credential of AI/storage");
    return;
  }
}

function getAIData(appId, apiKey, span, callback) {
  let now = new Date();
  let start = new Date();
  start.setMinutes(start.getMinutes() - span);
  request(node_util.format(restUrl, appId, encodeURIComponent(node_util.format(kustoQuery, start.toISOString(), now.toISOString()))), {
    headers: {
      "x-api-key": apiKey
    }
  }, (err, response, body) => {
    if (err) {
      if (callback) {
        callback(e, null);
      }
      return;
    }
    try {
      body = JSON.parse(body);
      let result = body.tables[0].rows.length === 0 ? [] : body.tables[0].rows.map(row => JSON.parse(row[0]));
      if (callback) {
        callback(null, result);
      }
    } catch (e) {
      if (callback) {
        callback(e, null);
      }
    }
  });
}

function getStorageData(cs, storageSubscriptionId, storageResourceGroupName, storageIoTHubName, span, callback) {
  let now = new Date();
  let start = new Date();
  start.setMinutes(start.getMinutes() - span);
  let promises = [];
  let entryName = node_util.format(blobUrlTemplate,
    storageSubscriptionId.toUpperCase(),
    storageResourceGroupName.toUpperCase(),
    storageIoTHubName.toUpperCase(),
    now.getUTCFullYear(),
    fillZero(now.getUTCMonth() + 1),
    fillZero(now.getUTCDate()),
    fillZero(now.getUTCHours())
  );
  promises.push(_getStorageData(containerName, entryName));
  if (now.getUTCHours() !== start.getUTCHours()) {
    let entryName = node_util.format(blobUrlTemplate,
      storageSubscriptionId.toUpperCase(),
      storageResourceGroupName.toUpperCase(),
      storageIoTHubName.toUpperCase(),
      start.getUTCFullYear(),
      fillZero(start.getUTCMonth() + 1),
      fillZero(start.getUTCDate()),
      fillZero(start.getUTCHours())
    );
    promises.push(_getStorageData(containerName, entryName));
  }

  Promise.all(promises).then(results => {
    let finalResults = [];
    for (let result of results) {
      for (let record of result) {
        let date = new Date(record.time);
        if (date >= start && date <= now) {
          finalResults.push(record);
        }
      }
    }
    if (callback) callback(null, finalResults);
  }).catch(err => {
    if (callback) callback(err, null);
  });
}

function _getStorageData(containerName, entryName) {
  return new Promise((resolve, reject) => {
    if(blobSvc == null) {
      reject('Storage connection string is not specified.');
    }
    blobSvc.getBlobToText(containerName, entryName, (error, blobContent, blob) => {
      if (error) {
        if(error.message.startsWith("The specified blob does not exist.")) {
          resolve([]);
        }else {
          reject(error);
        }
      } else {
        let records = JSON.parse(blobContent).records;
        resolve(records);
      }
    });
  })
}

function fillZero(value) {
  if (value < 10) {
    return '0' + value;
  }
  return '' + value;
}

router.get('/', queue({ activeLimit: 1, queuedLimit: -1 }), function (req, res) {
  handle(req, res, false);
});

router.get('/init', function (req, res) {
  handle(req, res, true);
});

router.get('/kusto', (req,res)=>{
  let query = req.query.query;
  if(!query) {
    res.status(500).send('Query not specified');
    return;
  }
  let subscriptionId = process.env.SUBSCRIPTION_ID;
  let resourceGroupName = process.env.RESOURCE_GROUP_NAME;
  let aiName = process.env.AI_NAME;
  if(!subscriptionId || !resourceGroupName ||!aiName) {
    res.status(500).send('SUBSCRIPTION_ID or RESOURCE_GROUP_NAME or AI_NAME not specified in environment variable');
    return;
  }
  let url = node_util.format(kustoUrlTemplate, subscriptionId, resourceGroupName, aiName, query);
  res.redirect(url);
});

router.get('/debug', (req, res) => {
  res.json({
    requestNum,
    cacheMissNum,
  });
});

router.get('/debug/reset', (req, res) => {
  requestNum = 0;
  cacheMissNum = 0;
  res.json({
    requestNum,
    cacheMissNum,
  });
});

module.exports = router;
