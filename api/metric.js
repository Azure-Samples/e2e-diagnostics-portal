var express = require('express');
var router = express.Router();
var request = require('request');
var node_util = require('util');
var config = require('../config');
// var Util = require('../util/util');
var queue = require('express-queue');

let startOfTimestamp = new Date(config.startTime);
var kustoQuery = `customEvents | where name == 'E2EDIAGNOSTICS' and timestamp >= ago(7d) and todatetime(tostring(customDimensions['time'])) >= datetime('%s') and todatetime(tostring(customDimensions['time'])) <= datetime('%s') | project customDimensions`;
var restUrl = "https://api.applicationinsights.io/v1/apps/%s/query?timespan=P7D&query=%s";
// var e2ePath = 'customEvents/E2EDIAGNOSTICS';
// var kustoPath = 'https://analytics.applicationinsights.io%s/components/%s';
/* GET home page. */

// router.get('/kusto', function(req, res) {
//     res.redirect(node_util.format(kustoPath,process.env.RESOURCE_GROUP_NAME,process.env.APPLICATION_INSIGHTS_NAME));
// });

function handle(req, res) {
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
  var appId = '28192abf-e335-4044-ae29-47bbfac72ddd';//Util.getAppId();
  if (!appId) {
    res.status(500).send("App id missing");
    return;
  }
  var start = parseInt(req.query.start);
  var end = parseInt(req.query.end);
  if (start == undefined || end == undefined) {
    res.status(500).send("start or end is not provided");
    return;
  }
  var key = process.env.API_KEY;
  if (!key) {
    res.status(500).send("api key is not specified");
    return;
  }
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
      return;
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
}

router.get('/',  function (req, res) {
  handle(req, res);
});

module.exports = router;
