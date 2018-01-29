const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const cfg = require('../config');

const device = require('./device');
const metric = require('./metric');

const app = express();
app.use(bodyParser.json());
app.use(cors());

app.use('/api/device', device);
app.use('/api/metric', metric);

app.use(express.static('.'));

app.listen(process.env.PORT || 3001, null, null, () => {
  console.log('listening on ' + process.env.PORT || 3001);
});