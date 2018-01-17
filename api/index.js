const express = require('express');
const bodyParser = require('body-parser');

const device = require('./device');
const metric = require('./metric');

const app = express();
app.use(bodyParser.json());

app.use('/api/device', device);
app.use('/api/metric', metric);

app.listen(3001, null, null, () => {
  console.log('listening on ' + 3001);
});