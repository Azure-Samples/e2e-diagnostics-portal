/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, {
/******/ 				configurable: false,
/******/ 				enumerable: true,
/******/ 				get: getter
/******/ 			});
/******/ 		}
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = 4);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ (function(module, exports) {

module.exports = require("express");

/***/ }),
/* 1 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


module.exports = {};

/***/ }),
/* 2 */
/***/ (function(module, exports) {

module.exports = require("memory-cache");

/***/ }),
/* 3 */
/***/ (function(module, exports) {

module.exports = require("express-queue");

/***/ }),
/* 4 */
/***/ (function(module, exports, __webpack_require__) {

__webpack_require__(5);
module.exports = __webpack_require__(6);


/***/ }),
/* 5 */
/***/ (function(module, exports) {

module.exports = require("babel-polyfill");

/***/ }),
/* 6 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var express = __webpack_require__(0);
var bodyParser = __webpack_require__(7);
var cors = __webpack_require__(8);
var cfg = __webpack_require__(1);

var device = __webpack_require__(9);
var metric = __webpack_require__(11);

var app = express();
app.use(bodyParser.json());
app.use(cors());

app.use('/api/device', device);
app.use('/api/metric', metric);

app.use(express.static('.'));

app.listen(process.env.PORT || 3001, null, null, function () {
  console.log('listening on ' + process.env.PORT || 3001);
});

/***/ }),
/* 7 */
/***/ (function(module, exports) {

module.exports = require("body-parser");

/***/ }),
/* 8 */
/***/ (function(module, exports) {

module.exports = require("cors");

/***/ }),
/* 9 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var express = __webpack_require__(0);
var router = express.Router();
var cache = __webpack_require__(2);
var queue = __webpack_require__(3);

var requestNum = 0;
var cacheMissNum = 0;

var twinKey = "__e2e_diag_sample_rate";
var cacheSpanInSeconds = 10;

var Registry = void 0;

router.get('/', queue({ activeLimit: 1, queuedLimit: -1 }), function (req, res) {
  requestNum++;
  var cachedDevice = cache.get('device');
  if (cachedDevice) {
    res.send(cachedDevice);
    return;
  }
  cacheMissNum++;
  if (process.env.EXPIRE) {
    var expiration = process.env.EXPIRE;
    var initDate = req.query.init;
    if (!initDate || initDate < expiration) {
      res.json({
        registered: 0,
        connected: 0,
        error: "API request expired"
      });
      return;
    }
  }
  var connectionString = process.env.IOTHUB_CONNECTION_STRING;
  if (!connectionString) {
    res.status(500).send('Connection string is not specified.');
    return;
  }
  var m = connectionString.match(/HostName=([^\.]*)\.azure\-devices\.net/);
  var iothubName = void 0;
  if (m) {
    iothubName = m[1];
  }
  if (!Registry) {
    Registry = __webpack_require__(10).Registry.fromConnectionString(connectionString);
  }

  Registry.list(function (err, deviceList) {
    if (err) {
      res.status(500).send('Could not trigger job: ' + err.message);
      return;
    } else {
      var deviceArray = [];
      var promises = [];
      deviceList.forEach(function (device) {
        var d = {
          deviceId: device.deviceId,
          connected: device.connectionState === "Connected"
        };
        deviceArray.push(d);
        promises.push(getTwin(device.deviceId));
      });
      Promise.all(promises).then(function (results) {
        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
          var _loop = function _loop() {
            var twin = _step.value;

            if (!twin) {
              return 'continue';
            }
            var device = deviceArray.find(function (d) {
              return d.deviceId === twin.deviceId;
            });
            device.diagnosticDesired = twin.properties.desired[twinKey];
            device.diagnosticReported = twin.properties.reported[twinKey];
          };

          for (var _iterator = results[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
            var _ret = _loop();

            if (_ret === 'continue') continue;
          }
        } catch (err) {
          _didIteratorError = true;
          _iteratorError = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion && _iterator.return) {
              _iterator.return();
            }
          } finally {
            if (_didIteratorError) {
              throw _iteratorError;
            }
          }
        }

        var result = {
          iothub: iothubName,
          devices: deviceArray
        };
        cache.put('device', result, cacheSpanInSeconds * 1000);
        res.send(result);
      });
    }
  });
});

function getTwin(deviceId) {
  return new Promise(function (resolve, reject) {
    Registry.getTwin(deviceId, function (err, twin) {
      if (err) {
        console.log(err);
        resolve();
      } else {
        resolve(twin);
      }
    });
  });
}

router.get('/debug', function (req, res) {
  res.json({
    requestNum: requestNum,
    cacheMissNum: cacheMissNum
  });
});

module.exports = router;

/***/ }),
/* 10 */
/***/ (function(module, exports) {

module.exports = require("azure-iothub");

/***/ }),
/* 11 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var express = __webpack_require__(0);
var router = express.Router();
var request = __webpack_require__(12);
var node_util = __webpack_require__(13);
var config = __webpack_require__(1);
// var Util = require('../util/util');
var queue = __webpack_require__(3);
var cache = __webpack_require__(2);
var storage = __webpack_require__(14);

var startOfTimestamp = new Date(config.startTime);
var kustoQuery = 'customEvents | where name == \'E2EDiagnostics\' and timestamp >= ago(1d) and todatetime(tostring(customDimensions[\'time\'])) >= datetime(\'%s\') and todatetime(tostring(customDimensions[\'time\'])) <= datetime(\'%s\') | project customDimensions';
var restUrl = "https://api.applicationinsights.io/v1/apps/%s/query?timespan=P7D&query=%s";
var blobUrlTemplate = "resourceId=/SUBSCRIPTIONS/%s/RESOURCEGROUPS/%s/PROVIDERS/MICROSOFT.DEVICES/IOTHUBS/%s/y=%s/m=%s/d=%s/h=%s/m=00/PT1H.json";
var kustoUrlTemplate = 'https://analytics.applicationinsights.io/subscriptions/%s/resourcegroups/%s/components/%s?q=%s&apptype=other&timespan=P1D';
var containerNames = ['insights-logs-e2ediagnostics', 'insights-logs-connections'];
var cacheSpanInMinutes = 1;
var defaultSpanForRefreshInMinutes = 20;

var requestNum = 0;
var cacheMissNum = 0;

var blobSvc = process.env.STORAGE_CONNECTION_STRING ? storage.createBlobService(process.env.STORAGE_CONNECTION_STRING) : null;
// var e2ePath = 'customEvents/E2EDIAGNOSTICS';
/* GET home page. */

// router.get('/kusto', function(req, res) {
//     res.redirect(node_util.format(kustoPath,process.env.RESOURCE_GROUP_NAME,process.env.APPLICATION_INSIGHTS_NAME));
// });

function handle(req, res, init) {
  if (!init) requestNum++;
  if (process.env.EXPIRE) {
    var expiration = process.env.EXPIRE.substring(1, 25);
    var initDate = req.query.init;
    if (!initDate || initDate < expiration) {
      res.json({
        value: [],
        error: "API request expired"
      });
      return;
    }
  }

  var span = void 0;
  if (init) {
    span = parseInt(req.query.span);
    if (span == undefined) {
      res.status(500).send("span is not provided");
      return;
    }
  } else {
    span = defaultSpanForRefreshInMinutes;
    var cachedData = cache.get('metric');
    if (cachedData) {
      res.send(cachedData);
      return;
    } else {
      cacheMissNum++;
    }
  }

  var appId = process.env.AI_APP_ID;
  var apiKey = process.env.AI_API_KEY;
  var storageCs = process.env.STORAGE_CONNECTION_STRING;
  var storageSubscriptionId = process.env.SUBSCRIPTION_ID;
  var storageResourceGroupName = process.env.RESOURCE_GROUP_NAME;
  var iothubConnectionString = process.env.IOTHUB_CONNECTION_STRING;
  if (!iothubConnectionString) {
    res.status(500).send('Connection string is not specified.');
    return;
  }
  var m = iothubConnectionString.match(/HostName=([^\.]*)\.azure\-devices\.net/);
  var storageIoTHubName = void 0;
  if (m) {
    storageIoTHubName = m[1];
  } else {
    res.status(500).send('IoT Hub Connection string format error.');
    return;
  }

  var callback = function callback(source, err, data) {
    if (err) {
      res.json({
        value: [],
        error: err.message,
        source: source
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
        source: source
      });
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
  var now = new Date();
  var start = new Date();
  start.setMinutes(start.getMinutes() - span);
  request(node_util.format(restUrl, appId, encodeURIComponent(node_util.format(kustoQuery, start.toISOString(), now.toISOString()))), {
    headers: {
      "x-api-key": apiKey
    }
  }, function (err, response, body) {
    if (err) {
      if (callback) {
        callback(e, null);
      }
      return;
    }
    try {
      body = JSON.parse(body);
      var result = body.tables[0].rows.length === 0 ? [] : body.tables[0].rows.map(function (row) {
        return JSON.parse(row[0]);
      });
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
  var now = new Date();
  var start = new Date();
  start.setMinutes(start.getMinutes() - span);
  var promises = [];
  var entryName = node_util.format(blobUrlTemplate, storageSubscriptionId.toUpperCase(), storageResourceGroupName.toUpperCase(), storageIoTHubName.toUpperCase(), now.getUTCFullYear(), fillZero(now.getUTCMonth() + 1), fillZero(now.getUTCDate()), fillZero(now.getUTCHours()));
  containerNames.forEach(function (containerName) {
    promises.push(_getStorageData(containerName, entryName));
    if (now.getUTCHours() !== start.getUTCHours()) {
      var _entryName = node_util.format(blobUrlTemplate, storageSubscriptionId.toUpperCase(), storageResourceGroupName.toUpperCase(), storageIoTHubName.toUpperCase(), start.getUTCFullYear(), fillZero(start.getUTCMonth() + 1), fillZero(start.getUTCDate()), fillZero(start.getUTCHours()));
      promises.push(_getStorageData(containerName, _entryName));
    }
  });

  Promise.all(promises).then(function (results) {
    var finalResults = [];
    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
      for (var _iterator = results[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
        var result = _step.value;
        var _iteratorNormalCompletion2 = true;
        var _didIteratorError2 = false;
        var _iteratorError2 = undefined;

        try {
          for (var _iterator2 = result[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
            var record = _step2.value;

            var date = new Date(record.time);
            if (date >= start && date <= now) {
              finalResults.push(record);
            }
          }
        } catch (err) {
          _didIteratorError2 = true;
          _iteratorError2 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion2 && _iterator2.return) {
              _iterator2.return();
            }
          } finally {
            if (_didIteratorError2) {
              throw _iteratorError2;
            }
          }
        }
      }
    } catch (err) {
      _didIteratorError = true;
      _iteratorError = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion && _iterator.return) {
          _iterator.return();
        }
      } finally {
        if (_didIteratorError) {
          throw _iteratorError;
        }
      }
    }

    if (callback) callback(null, finalResults);
  }).catch(function (err) {
    if (callback) callback(err, null);
  });
}

function _getStorageData(containerName, entryName) {
  return new Promise(function (resolve, reject) {
    if (blobSvc == null) {
      reject('Storage connection string is not specified.');
    }
    blobSvc.getBlobToText(containerName, entryName, function (error, blobContent, blob) {
      if (error) {
        if (error.message.startsWith("The specified blob does not exist.")) {
          resolve([]);
        } else {
          reject(error);
        }
      } else {
        var records = JSON.parse(blobContent).records;
        resolve(records);
      }
    });
  });
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

router.get('/kusto', function (req, res) {
  var query = req.query.query;
  if (!query) {
    res.status(500).send('Query not specified');
    return;
  }
  var subscriptionId = process.env.SUBSCRIPTION_ID;
  var resourceGroupName = process.env.RESOURCE_GROUP_NAME;
  var aiName = process.env.AI_NAME;
  if (!subscriptionId || !resourceGroupName || !aiName) {
    res.status(500).send('SUBSCRIPTION_ID or RESOURCE_GROUP_NAME or AI_NAME not specified in environment variable');
    return;
  }
  var url = node_util.format(kustoUrlTemplate, subscriptionId, resourceGroupName, aiName, query);
  res.redirect(url);
});

router.get('/debug', function (req, res) {
  res.json({
    requestNum: requestNum,
    cacheMissNum: cacheMissNum
  });
});

router.get('/debug/reset', function (req, res) {
  requestNum = 0;
  cacheMissNum = 0;
  res.json({
    requestNum: requestNum,
    cacheMissNum: cacheMissNum
  });
});

module.exports = router;

/***/ }),
/* 12 */
/***/ (function(module, exports) {

module.exports = require("request");

/***/ }),
/* 13 */
/***/ (function(module, exports) {

module.exports = require("util");

/***/ }),
/* 14 */
/***/ (function(module, exports) {

module.exports = require("azure-storage");

/***/ })
/******/ ]);