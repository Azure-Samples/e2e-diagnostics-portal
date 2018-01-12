var express = require('express');
var router = express.Router();
var request = require('request');
var node_util = require('util');
var Util = require('../util/util');
var apicache = require('apicache');

var restUrl = 'https://api.applicationinsights.io/beta/apps/%s/metrics/%s?%s&aggregation=%s';
var e2ePath = 'customEvents/E2EDIAGNOSTICS';
var kustoPath = 'https://analytics.applicationinsights.io%s/components/%s';
/* GET home page. */

// router.get('/kusto', function(req, res) {
//     res.redirect(node_util.format(kustoPath,process.env.RESOURCE_GROUP_NAME,process.env.APPLICATION_INSIGHTS_NAME));
// });

router.get('/get/:param',apicache.middleware('10 seconds'), function (req, res) {
    var appId = Util.getAppId();
    if (!appId) {
        res.status(500).send("App id missing")
    }
    var keys = [];
    for (var i = 0; i < 5; i++) {
        var key = Util.getApiKey(i);
        if (!key) {
            res.status(500).send("Api key missing")
        }
        keys.push(key);
    }
    var param = req.params.param;
    if (!param) {
        res.sendStatus(400);
    }

    new Promise((resolve, reject) => {
        var result = {};
        var counter = 5;
        request(node_util.format(restUrl, appId, d2cPath, param,'avg,count,max'), {
            headers: {
                "x-api-key": keys[0]
            }
        }, apiCallback.bind(this, resolve, reject, 'd2c_success',d2cPath,'avg,count,max'));

        request(node_util.format(restUrl, appId, saPath, param,'avg,count,max'), {
            headers: {
                "x-api-key": keys[1]
            }
        }, apiCallback.bind(this, resolve, reject, 'sa_success',saPath,'avg,count,max'));

        request(node_util.format(restUrl, appId, funcPath, param,'avg,count,max'), {
            headers: {
                "x-api-key": keys[2]
            }
        }, apiCallback.bind(this, resolve, reject, 'func_success',funcPath,'avg,count,max'));
        
        request(node_util.format(restUrl, appId, saFailurePath, param,'sum'), {
            headers: {
                "x-api-key": keys[3]
            }
        }, apiCallback.bind(this, resolve, reject, 'sa_failure_count',saFailurePath,'sum'));

        request(node_util.format(restUrl, appId, funcFailurePath, param,'sum'), {
            headers: {
                "x-api-key": keys[4]
            }
        }, apiCallback.bind(this, resolve, reject, 'func_failure_count',funcFailurePath,'sum'));

        function apiCallback(resolve, reject, key,path,type, error, response, body) {
            console.log('callback called');
            body = JSON.parse(body);
            if (error) {
                reject(error);
            } else if (response.statusCode != 200) {
                reject("Invalid status code " + response.statusCode);
            } else {
                var types = type.split(",");
                result[key] = {};
                for(var i in types) {
                    result[key][types[i]] = body.value[path][types[i]];
                }
            }
            counter--;
            if (counter == 0) {
                resolve(result);
            }
        }
    }).then((result) => {
        res.send(result);
    }).catch((error) => {
        res.status(500).send(error);
    });

});

module.exports = router;
