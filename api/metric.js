var express = require('express');
var router = express.Router();
var request = require('request');
var node_util = require('util');
var config = require('../config');
// var Util = require('../util/util');
var apicache = require('apicache');

let startOfTimestamp = new Date(config.startTime);
var kustoQuery = `customEvents | where name == 'E2EDIAGNOSTICS' and timestamp >= ago(7d) and todatetime(tostring(customDimensions['time'])) >= datetime('%s') and todatetime(tostring(customDimensions['time'])) <= datetime('%s') | project customDimensions`;
var restUrl = "https://api.applicationinsights.io/v1/apps/%s/query?timespan=P7D&query=%s";
// var e2ePath = 'customEvents/E2EDIAGNOSTICS';
// var kustoPath = 'https://analytics.applicationinsights.io%s/components/%s';
/* GET home page. */

// router.get('/kusto', function(req, res) {
//     res.redirect(node_util.format(kustoPath,process.env.RESOURCE_GROUP_NAME,process.env.APPLICATION_INSIGHTS_NAME));
// });

router.get('/', function (req, res) {
  var appId = '28192abf-e335-4044-ae29-47bbfac72ddd';//Util.getAppId();
  if (!appId) {
    res.status(500).send("App id missing")
  }
  var start = parseInt(req.query.start);
  var end = parseInt(req.query.end);
  if (start == undefined || end == undefined) {
    res.status(500).send("start or end is not provided")
  }
  var key = 'q5170hcg0hfz13zsngxxcykrezfvpvosrj7pzwll';
  let startDate = new Date(startOfTimestamp.getTime());
  let endDate = new Date(startOfTimestamp.getTime());
  startDate.setSeconds(startDate.getSeconds() + start);
  endDate.setSeconds(endDate.getSeconds() + end);
  request(node_util.format(restUrl, appId, encodeURIComponent(node_util.format(kustoQuery, startDate.toISOString(), endDate.toISOString()))), {
    headers: {
      "x-api-key": key
    }
  }, (err, response, body) => {
    if (err) {
      res.status(500).send(err.message);
    }
    console.log(body);
    try {
      body = JSON.parse(body);
      let result = {};
      // result.count = body['@odata.count'];
      result.value = body.tables[0].rows.length === 0 ? [] : body.tables[0].rows.map(row => JSON.parse(row[0]));
      res.json(result);
    } catch (e) {
      res.json({
        value: [],
        error: e.message,
      });
    }
  });

  // var result = {};
  // var counter = 5;
  // request(node_util.format(restUrl, appId, d2cPath, param,'avg,count,max'), {
  //     headers: {
  //         "x-api-key": keys[0]
  //     }
  // }, apiCallback.bind(this, resolve, reject, 'd2c_success',d2cPath,'avg,count,max'));

  // request(node_util.format(restUrl, appId, saPath, param,'avg,count,max'), {
  //     headers: {
  //         "x-api-key": keys[1]
  //     }
  // }, apiCallback.bind(this, resolve, reject, 'sa_success',saPath,'avg,count,max'));

  // request(node_util.format(restUrl, appId, funcPath, param,'avg,count,max'), {
  //     headers: {
  //         "x-api-key": keys[2]
  //     }
  // }, apiCallback.bind(this, resolve, reject, 'func_success',funcPath,'avg,count,max'));

  // request(node_util.format(restUrl, appId, saFailurePath, param,'sum'), {
  //     headers: {
  //         "x-api-key": keys[3]
  //     }
  // }, apiCallback.bind(this, resolve, reject, 'sa_failure_count',saFailurePath,'sum'));

  // request(node_util.format(restUrl, appId, funcFailurePath, param,'sum'), {
  //     headers: {
  //         "x-api-key": keys[4]
  //     }
  // }, apiCallback.bind(this, resolve, reject, 'func_failure_count',funcFailurePath,'sum'));

  //   function apiCallback(resolve, reject, key, path, type, error, response, body) {
  //     console.log('callback called');
  //     body = JSON.parse(body);
  //     if (error) {
  //       reject(error);
  //     } else if (response.statusCode != 200) {
  //       reject("Invalid status code " + response.statusCode);
  //     } else {
  //       var types = type.split(",");
  //       result[key] = {};
  //       for (var i in types) {
  //         result[key][types[i]] = body.value[path][types[i]];
  //       }
  //     }
  //     counter--;
  //     if (counter == 0) {
  //       resolve(result);
  //     }
  //   }
  // }).then((result) => {
  //   res.send(result);
  // }).catch((error) => {
  //   res.status(500).send(error);
  // });

});

module.exports = router;
