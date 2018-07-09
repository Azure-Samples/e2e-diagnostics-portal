import React, { Component } from 'react';
import './dashboard.scss';
import gzip from 'gzip-js';
import { Motion, TransitionMotion, spring, presets } from 'react-motion';
import { Stage, Layer, Group, Rect, Label, Tag, Text, Image as KonvaImage, Path, Line, Arc } from 'react-konva';
import config from '../config';
import util from 'util';
import SvgChip from '../asset/microchip.svg';
import PngIotHub from '../asset/iothub.png';
import SvgExpand from '../asset/expand.svg';
import SvgEndpoint from '../asset/endpoint.svg';
import PngEventhub from '../asset/eventhub.png';
import SvgCompress from '../asset/compress.svg';
import PngDiagnosticOn from '../asset/diagnostic-on.png';
import PngDiagnosticOff from '../asset/diagnostic-off.png';
import PngStorage from '../asset/storage.png';
import PngServiceBus from '../asset/servicebus.png';
import PngCloseStorageTable from '../asset/close-table.png';
import PngDeviceOnlineRatio from '../asset/onlineRatio.png';
import { setInterval } from 'timers';

// Import React Table
import ReactTable from 'react-table';
import 'react-table/react-table.css';

class Dashboard extends Component {
  constructor(props) {
    super(props);
    this.state = {
      expand: false,
      connectedDevices: 0,
      registeredDevices: 0,
      diagnosticOnDevices: 0,
      devices: new Map(),
      toggleDevices: new Map(),
      endpoints: new Map(),
      unmatchedNumber: 0,
      leftLineInAnimationProgress: 0,
      rightLineInAnimationProgress: 0,
      spanInMinutes: 20,
      loading: true,
      iotHubName: '',
      sourceAI: false,
      storageTable: [],
      showStorageTable: false,
      showTooltip: false,
      showCorrelationId: true,
      showDuration: true,
    };
    this.records = new Map();
    this.unmatchedMap = new Map();
    this.initDate = null;
    this.queryMetricSpanInSeconds = 30;
    this.queryDeviceSpanInSeconds = 2;
    this.iotHubImage = new Image();
    this.iotHubImage.src = PngIotHub;
    this.eventHubImage = new Image();
    this.eventHubImage.src = PngEventhub;
    this.diagnosticOnImage = new Image();
    this.diagnosticOnImage.src = PngDiagnosticOn;
    this.diagnosticOffImage = new Image();
    this.diagnosticOffImage.src = PngDiagnosticOff;
    this.storageImage = new Image();
    this.storageImage.src = PngStorage;
    this.serviceBusImage = new Image();
    this.serviceBusImage.src = PngServiceBus;
    this.onlineRatioImage = new Image();
    this.onlineRatioImage.src = PngDeviceOnlineRatio;
    this.startOfTimestamp = new Date(config.startTime);
  }

  getDeviceNumber = (callback) => {
    fetch(this.getApiDomain() + '/api/device?init=' + encodeURIComponent(this.initDate.toISOString())).then(results => results.json()).then(data => {
      let devices = data.devices;
      let currentDeviceMap = this.state.expand ? this.state.devices : this.state.toggleDevices;
      let toggleDeviceMap = this.state.expand ? this.state.toggleDevices : this.state.devices;
      let toggleDevice = toggleDeviceMap.get('All Devices') || {
        name: 'All Devices',
        avg: 0,
        max: -1,
        maxId: '',
        avgSize: 0,
        messageCount: 0,
      };
      toggleDeviceMap.set('All Devices', toggleDevice);
      devices.sort((a, b) => {
        if (a.connected && !b.connected) {
          return -1;
        }
        if (b.connected && !a.connected) {
          return 1;
        }
      });
      let connectedNumber = 0;
      let diagnosticOnNumber = 0;
      for (let device of devices) {
        if (device.connected) {
          connectedNumber++;
        }
        if (device.diagnosticDesired != undefined) {
          if (currentDeviceMap.has(device.deviceId)) {
            let d = currentDeviceMap.get(device.deviceId);
            d.connected = device.connected;
            d.diagnosticDesired = device.diagnosticDesired;
            d.diagnosticReported = device.diagnosticReported;
          } else {
            let d = {
              name: device.deviceId,
              connected: device.connected,
              diagnosticDesired: device.diagnosticDesired,
              diagnosticReported: device.diagnosticReported,
              onlineRatio: NaN,
              avg: 0,
              max: -1,
              maxId: '',
              avgSize: 0,
              messageCount: 0,
            };
            currentDeviceMap.set(device.deviceId, d);
          }
          diagnosticOnNumber++;
        }
      }
      this.setState({
        connectedDevices: connectedNumber,
        registeredDevices: devices.length,
        diagnosticOnDevices: diagnosticOnNumber,
        [this.state.expand ? 'devices' : 'toggleDevices']: currentDeviceMap,
        [this.state.expand ? 'toggleDevices' : 'devices']: toggleDeviceMap,
        iotHubName: data.iothub,
      }, callback);
    }).catch((e) => {
      console.error('[E2E] Fetching device status error.', e.message);
    })
  }

  getCurrentTimeWindow = () => {
    let end = new Date();
    let start = new Date();
    start.setMinutes(start.getMinutes() - this.state.spanInMinutes);
    return [start, end];
  }

  processDeviceConnStatus = (item) => {
    try {
      let newRec = {
        time: Date.parse(item.time),
        isConn: item.operationName === 'deviceConnect'
      };
      let deviceId = JSON.parse(item.properties).deviceId;
      let deviceConns = this.connRecords.get(deviceId);
      if (!deviceConns) {
        deviceConns = [];
        this.connRecords.set(deviceId, deviceConns);
      }
      if (!deviceConns.find(rec => rec.time === newRec.time)) {
        deviceConns.push(newRec);
      }
    } catch (e) {
      console.error("Failed to process device connection record: ", e.message);
    }
  }

  refresh = (firstCall, retry, callback) => {
    if (firstCall && !retry) {
      this.reset();
      this.showLoading();
    }
    let records = this.records;
    let url;
    if (firstCall) {
      url = this.getApiDomain() + '/api/metric/init?span=' + this.state.spanInMinutes + '&init=' + encodeURIComponent(this.initDate.toISOString());
    } else {
      url = this.getApiDomain() + '/api/metric?init=' + encodeURIComponent(this.initDate.toISOString());
    }
    fetch(url).then(results => results.json()).then(data => {
      let devices = this.state.expand ? this.state.devices : this.state.toggleDevices;
      let endpoints = this.state.endpoints;
      let toggleDeviceMap = this.state.expand ? this.state.toggleDevices : this.state.devices;
      let unmatched = this.unmatchedMap;
      let toggleDevice = toggleDeviceMap.get('All Devices') || {
        name: 'All Devices',
        avg: 0,
        max: -1,
        maxId: '',
        avgSize: 0,
        messageCount: 0,
      };

      let [startDate, endDate] = this.getCurrentTimeWindow();

      let toggleDeviceCount = 0;
      let toggleDeviceMax = -1;
      let toggleDeviceMaxId = '';
      let toggleDeviceSum = 0;
      let toggleDeviceSumSize = 0;
      let p1 = performance.now();
      if (data.source === 'ai') {
        this.setState({
          sourceAI: true
        });
      }
      for (let item of data.value) {
        if (item.operationName === 'deviceConnect' || item.operationName === 'deviceDisconnect') {
          this.processDeviceConnStatus(item);
          item.properties = JSON.parse(item.properties);
          records.set(item.time + item.properties.deviceId + item.operationName, item);
        } else if (item.operationName === 'DiagnosticIoTHubEgress' || item.operationName === 'DiagnosticIoTHubD2C' || item.operationName === 'DiagnosticIoTHubIngress') {
          if (!records.has(item.correlationId + item.operationName)) {
            if (!this.state.iotHubName && item.resourceId) {
              let matches = item.resourceId.match(/IOTHUBS\/(.*)/);
              if (matches && matches[1]) {
                this.setState({
                  iotHubName: matches[1]
                });
              }
            }
            let correlationPrefix = item.correlationId.substring(8, 16);
            item.durationMs = parseFloat(item.durationMs);
            item.time = new Date(item.time);
            try {
              item.properties = JSON.parse(item.properties);
            } catch (e) {
              continue;
            }
            item.properties.messageSize = parseFloat(item.properties.messageSize);
            records.set(item.correlationId + item.operationName, item);

            if (item.operationName === 'DiagnosticIoTHubEgress') {
              if (endpoints.has(item.properties.endpointName)) {
                let value = endpoints.get(item.properties.endpointName);
                if (item.durationMs > value.max) {
                  value.max = item.durationMs;
                  value.maxId = item.correlationId + item.operationName;
                }
                value.avg = (value.avg * value.messageCount + item.durationMs) / (value.messageCount + 1);
                value.messageCount++;
                endpoints.set(item.properties.endpointName, value);
              } else {
                let value = {
                  name: item.properties.endpointName,
                  type: item.properties.endpointType,
                  avg: item.durationMs,
                  max: item.durationMs,
                  maxId: item.correlationId + item.operationName,
                  messageCount: 1
                }
                endpoints.set(item.properties.endpointName, value);
              }
              unmatched.set(correlationPrefix, false);
            } else if (item.operationName === 'DiagnosticIoTHubD2C') {
              if (devices.has(item.properties.deviceId)) {
                let value = devices.get(item.properties.deviceId);
                if (item.durationMs > value.max) {
                  value.max = item.durationMs;
                  value.maxId = item.correlationId + item.operationName;
                }
                value.avg = (value.avg * value.messageCount + item.durationMs) / (value.messageCount + 1);
                value.avgSize = (value.avgSize * value.messageCount + item.properties.messageSize) / (value.messageCount + 1);
                value.messageCount++;
                devices.set(item.properties.deviceId, value);
                // } else {
                //   let value = {
                //     name: item.properties.deviceId,
                //     avg: item.durationMs,
                //     max: item.durationMs,
                //     maxId: item.correlationId,
                //     avgSize: item.properties.messageSize,
                //     messageCount: 1
                //   }
                //   devices.set(item.properties.deviceId, value);
              }

              if (!unmatched.has(correlationPrefix)) {
                unmatched.set(correlationPrefix, true);
              }
            }
          }
        } else {
          console.log("Unprocessed record: ", item);
        }
      }

      let recordKeysToDelete = [];
      let deviceKeysToDelete = [];
      let endpointKeysToDelete = [];
      let updateMaxDevicesMap = new Map();
      let updateMaxEndpointsMap = new Map();

      let end = new Date();
      let start = new Date(end);
      start.setMinutes(start.getMinutes() - this.state.spanInMinutes);

      //sort connection records and calculate online time
      for (let [k, v] of this.connRecords) {
        let newRecs = v.filter(item => item.time >= start && item.time <= end);
        newRecs.sort((item1, item2) => item1.time - item2.time);
        this.connRecords.set(k, newRecs);
      }
      for (let [key, device] of devices) {
        let deviceConnRecords = this.connRecords.get(device.name);
        if (!deviceConnRecords) {
          device.onlineRatio = device.connected ? 100 : 0;
        } else {
          let prevTime = start;
          let isConnected = false;
          let onlineTimeInMs = 0;
          for (let rec of deviceConnRecords) {
            if (!rec.isConn) {
              onlineTimeInMs += rec.time - prevTime;
            }
            prevTime = rec.time;
            isConnected = rec.isConn;
          }
          if (isConnected) {
            onlineTimeInMs += end - prevTime;
          }
          device.onlineRatio = Math.round(onlineTimeInMs / (this.state.spanInMinutes * 60000) * 100 * 100) / 100;
        }
      }

      for (let [k, v] of records) {
        if (v.time < start || v.time > end) {
          let correlationPrefix = v.correlationId.substring(8, 16);
          unmatched.delete(correlationPrefix);
          recordKeysToDelete.push(k);
          if (v.operationName === 'DiagnosticIoTHubEgress') {
            let value = endpoints.get(v.properties.endpointName);
            if (value == undefined) {
              // console.error('[E2E] Endpoint: ' + v.properties.endpointName + ' is undefined');
              continue;
            }
            if (value.messageCount === 1) {
              endpointKeysToDelete.push(value.name);
              value.messageCount = 0;
              endpoints.set(v.properties.endpointName, value);
            } else {
              if (value.maxId === v.correlationId + v.operationName) {
                value.maxId = '';
                value.max = 0;
                updateMaxEndpointsMap.set(value.name, true);
              }
              value.avg = (value.avg * value.messageCount - v.durationMs) / (value.messageCount - 1);
              value.messageCount--;
              endpoints.set(v.properties.endpointName, value);
            }
          } else if (v.operationName === 'DiagnosticIoTHubD2C') {
            let value = devices.get(v.properties.deviceId);
            if (value == undefined) {
              // console.error('[E2E] Device: ' + v.properties.deviceId + ' is undefined');
              continue;
            }
            if (value.messageCount === 1) {
              deviceKeysToDelete.push(value.name);
              value.messageCount = 0;
              devices.set(v.properties.deviceId, value);
            } else {
              if (value.maxId === v.correlationId + v.operationName) {
                value.maxId = '';
                value.max = 0;
                updateMaxDevicesMap.set(value.name, true);
              }
              value.avg = (value.avg * value.messageCount - v.durationMs) / (value.messageCount - 1);
              value.messageCount--;
              devices.set(v.properties.deviceId, value);
            }
          } else if(v.operationName === 'DiagnosticIoTHubIngress') {
            records.delete(k);
          }
        }
      }

      for (let key of recordKeysToDelete) {
        records.delete(key);
      }
      for (let key of deviceKeysToDelete) {
        devices.delete(key);
      }
      for (let key of endpointKeysToDelete) {
        endpoints.delete(key);
      }

      for (let [k, v] of records) {
        if (v.operationName === 'DiagnosticIoTHubEgress') {
          if (updateMaxEndpointsMap.has(v.properties.endpointName) && endpoints.has(v.properties.endpointName)) {
            if (v.durationMs > endpoints.get(v.properties.endpointName).max) {
              let ep = endpoints.get(v.properties.endpointName);
              ep.max = v.durationMs;
              ep.maxId = v.correlationId + v.operationName;
              endpoints.set(v.properties.endpointName, ep);
            }
          }
        }
        else if (v.operationName === 'DiagnosticIoTHubD2C') {
          if (updateMaxDevicesMap.has(v.properties.deviceId) && devices.has(v.properties.deviceId)) {
            if (v.durationMs > devices.get(v.properties.deviceId).max) {
              let ep = devices.get(v.properties.deviceId);
              ep.max = v.durationMs;
              ep.maxId = v.correlationId + v.operationName;
              devices.set(v.properties.deviceId, ep);
            }
          }
          if (v.durationMs > toggleDeviceMax) {
            toggleDeviceMax = v.durationMs;
            toggleDeviceMaxId = v.correlationId + v.operationName;
          }
          toggleDeviceCount++;
          toggleDeviceSum += v.durationMs;
          toggleDeviceSumSize += v.properties.messageSize;
        }
      }

      toggleDevice.avg = toggleDeviceCount !== 0 ? toggleDeviceSum / toggleDeviceCount : 0;
      toggleDevice.avgSize = toggleDeviceCount !== 0 ? toggleDeviceSumSize / toggleDeviceCount : 0;
      toggleDevice.messageCount = toggleDeviceCount;
      toggleDevice.max = toggleDeviceMax;
      toggleDevice.maxId = toggleDeviceMaxId;
      toggleDeviceMap.set('All Devices', toggleDevice);

      let unmatchedNumber = 0;
      for (let v of unmatched.values()) {
        if (v) unmatchedNumber++;
      }

      let stateToSet = {
        endpoints,
        unmatchedNumber,
      };
      if (this.state.expand) {
        stateToSet.devices = devices;
        stateToSet.toggleDevices = toggleDeviceMap;
      } else {
        stateToSet.toggleDevices = devices;
        stateToSet.devices = toggleDeviceMap;
      }

      let p2 = performance.now();
      console.log('Consuming: ' + (p2 - p1));

      this.setState(stateToSet, callback);
      if (firstCall) {
        this.hideLoading();
      }
    }).catch(error => {
      callback(error);
    });
  }

  componentDidMount() {
    this.initDate = new Date();

    this.getDeviceNumber(() => {
      this.scheduleFirstRefreshWithRetry();
    });
    this.getDeviceNumberInterval = window.setInterval(this.getDeviceNumber, this.queryDeviceSpanInSeconds * 1000);
  }

  shouldComponentUpdate(nextProps, nextState) {
    if (this.state.showStorageTable && nextState.showStorageTable) {
      return false;
    }
    return true;
  }

  componentDidUpdate() {
  }

  toggleExpand = () => {
    this.leftLineAnimationHandler(0);
    this.setState(prev => {
      return {
        expand: !prev.expand,
        toggleDevices: prev.devices,
        devices: prev.toggleDevices
      }
    }, () => {
      this.leftLineAnimationHandler(1);
      setTimeout(() => {
        this.leftLineAnimationHandler(2);
      }, 600)
      setTimeout(() => {
        this.leftLineAnimationHandler(3);
      }, 1200)
    });
  }

  getY = (centerY, index, length, height, padding) => {
    return centerY + (index - length / 2 + 1 / 2) * (height + padding);
  }

  getDefaultStyles = (y) => {
    return Array.from(this.state.devices.values()).map(d => ({ data: { ...d }, key: d.name, style: { y, height: 0, opacity: 1 } }));
  };

  getDefaultNumberStyles = (y, height) => {
    let length = this.state.devices.size;
    return Array.from(this.state.devices.values()).map((d, index) => ({ data: { ...d }, key: d.name, style: { y: this.getY(y, index, length, height, 10), height: 0, opacity: 1 } }));
  };

  getStyles = (height, centerY, elements, progress, animationStep) => {
    let length = elements.size;
    if (progress >= animationStep) {
      return Array.from(elements.values()).map((d, index) => {
        let y = this.getY(centerY, index, length, height, 10) - 1 / 2 * height;
        return {
          data: { ...d }, key: d.name, style: {
            height: spring(height, presets.gentle),
            opacity: spring(1, presets.gentle),
            y: spring(y, presets.gentle),
          }
        }
      });
    } else {
      return [];
    }
  };

  willLeave = (y) => {
    return {
      // height: spring(0),
      opacity: spring(0),
      y: spring(0)
    };
  };

  willEnter = (y) => {
    return {
      height: 0,
      opacity: 0,
      y
    };
  };

  willEnterNumber = (y, style) => {
    return {
      height: 0,
      opacity: 0,
      y: style.style.y.val + 100
    };
  };

  leftLineAnimationHandler = (toStep) => {
    this.setState({
      leftLineInAnimationProgress: toStep
    })
  }

  rightLineAnimationHandler = (toStep) => {
    this.setState({
      rightLineInAnimationProgress: toStep
    })
  }

  getPointsFromProgress = (progress, x1, x2, x3, y1, y2) => {
    let dist1 = x2 - x1;
    let dist2 = (y2 > y1 ? y2 - y1 : y1 - y2);
    let dist3 = x3 - x2
    let totalDistance = dist1 + dist2 + dist3;
    let currentDistance = progress / 100 * totalDistance;
    if (currentDistance <= dist1) {
      return [x1, y1, x1 + currentDistance, y1];
    } else if (currentDistance <= dist1 + dist2) {
      return [x1, y1, x2, y1, x2, y1 + (y2 > y1 ? currentDistance - dist1 : -currentDistance + dist1)];
    } else if (currentDistance < totalDistance - 1) {
      return [x1, y1, x2, y1, x2, y2, x2 + currentDistance - dist1 - dist2, y2];
    } else {
      let lengthOfArrow = 10;
      let x4 = x2 + currentDistance - dist1 - dist2;
      let y4 = y2;
      let x5 = x4 - 0.7071 * lengthOfArrow;
      let y5 = y4 - 0.7071 * lengthOfArrow;
      let x6 = x5;
      let y6 = y4 + 0.7071 * lengthOfArrow;
      return [x1, y1, x2, y1, x2, y2, x4, y4, x5, y5, x4, y4, x6, y6];
    }
  }

  getReadableSize = (num) => {
    if (num < 1024) {
      return num.toFixed(0) + ' Bytes';
    } else if (num < 1024 * 1024) {
      return (num / 1024).toFixed(0) + ' KB';
    } else {
      return (num / 1024 / 1024).toFixed(0) + ' MB';
    }
  }

  changeCursorToPointer = () => {
    if (this.stageRef && this.stageRef._stage && this.stageRef._stage.content && this.stageRef._stage.content.style) {
      this.stageRef._stage.content.style.cursor = 'pointer';
    }
  }

  changeCursorToDefault = () => {
    if (this.stageRef && this.stageRef._stage && this.stageRef._stage.content && this.stageRef._stage.content.style) {
      this.stageRef._stage.content.style.cursor = 'default';
    }
  }

  scheduleFirstRefreshWithRetry = (retry = false) => {
    console.log('schedule start');
    this.refresh(true, retry, (err) => {
      if (err) {
        console.log('schedule with error, will retry')
        this.scheduleFirstRefreshWithRetry(true);
      } else {
        console.log('schedule success!!');
        this.leftLineAnimationHandler(1);
        setTimeout(() => {
          this.leftLineAnimationHandler(2);
        }, 600)
        setTimeout(() => {
          this.leftLineAnimationHandler(3);
        }, 1200)
        this.rightLineAnimationHandler(1);
        setTimeout(() => {
          this.rightLineAnimationHandler(2);
        }, 600)
        setTimeout(() => {
          this.rightLineAnimationHandler(3);
        }, 1200)
        this.refreshInterval = window.setInterval(() => {
          this.refresh(false, false, () => {
          });
        }, this.queryMetricSpanInSeconds * 1000)
      }
    });
  }

  changeTimeSpan = (span) => {
    if (this.state.spanInMinutes !== span) {
      if (this.refreshInterval) {
        window.clearInterval(this.refreshInterval);
      }
      this.setState({
        spanInMinutes: span
      }, this.scheduleFirstRefreshWithRetry);
    }
  }

  reset = () => {
    this.records = new Map();
    this.connRecords = new Map();
    this.unmatchedMap = new Map();
    let devices = new Map();
    let toggleDevices = this.state.expand ? this.state.devices : this.state.toggleDevices;
    for(let [k,v] of toggleDevices) {
      v.onlineRatio = NaN;
      v.avg = 0;
      v.max = -1;
      v.maxId = '';
      v.avgSize = 0;
      v.messageCount = 0;
    }
    
    this.setState({
      expand: false,
      endpoints: new Map(),
      unmatchedNumber: 0,
      leftLineInAnimationProgress: 0,
      rightLineInAnimationProgress: 0,
      devices,
      toggleDevices,
    })
  }

  encodeKustoQuery = (query) => {
    let s1 = query + '\n';
    let s2 = gzip.zip(s1);
    let s3 = String.fromCharCode(...s2);
    let s4 = btoa(s3);
    let url = this.getApiDomain() + '/api/metric/kusto?query=' + encodeURIComponent(s4);
    return url;
  }

  // type 0 all devices, 1 one device, 2 endpoint
  getKustoStatementForAvg = (start, end, type, id) => {
    let condition;
    if (type === 0) {
      condition = `'"deviceId"'`;
    } else if (type === 1) {
      condition = `'"deviceId":"${id}"'`;
    } else if (type === 2) {
      condition = `'"endpointName":"${id}"'`;
    } else if (type === 3) {
      return `customEvents | where timestamp >= ago(7d) and todatetime(tostring(customDimensions['time'])) >= datetime('${start.toISOString()}') and todatetime(tostring(customDimensions['time'])) <= datetime('${end.toISOString()}') and tostring(customDimensions['operationName']) == 'DiagnosticIoTHubIngress'`;
    }

    return `customEvents | where timestamp >= ago(7d) and todatetime(tostring(customDimensions['time'])) >= datetime('${start.toISOString()}') and todatetime(tostring(customDimensions['time'])) <= datetime('${end.toISOString()}') and customDimensions.properties contains ${condition} and tostring(customDimensions['operationName']) contains 'Diagnostic'`;
  }

  getKustoStatementForSingleRecord = (start, end, correlationId) => {
    return `customEvents | where timestamp >= ago(7d) and todatetime(tostring(customDimensions['time'])) >= datetime('${start.toISOString()}') and todatetime(tostring(customDimensions['time'])) <= datetime('${end.toISOString()}') and customDimensions.correlationId contains '${correlationId}'`;
  }

  getKustoStatementForConnection = (start, end, deviceId) => {
    let condition = `'"deviceId":"${deviceId}"'`;
    return `customEvents | where timestamp >= ago(7d) and todatetime(tostring(customDimensions['time'])) >= datetime('${start.toISOString()}') and todatetime(tostring(customDimensions['time'])) <= datetime('${end.toISOString()}') and customDimensions.properties contains ${condition} and tostring(customDimensions['operationName']) contains 'connect'`;
  }

  openLinkInNewPage = (link) => {
    window.open(link);
  }

  // type 0 all devices, 1 one device, 2 endpoint, 3 Ingress
  showAllStorageTable = (type, id) => {
    var table = [];
    this.records.forEach((value, key) => {
      if (type === 0 && value.operationName === 'DiagnosticIoTHubD2C') {
        table.push(value);
      }
      else if (type === 1 && value.operationName === 'DiagnosticIoTHubD2C' && value.properties.deviceId === id) {
        table.push(value);
      }
      else if (type === 2 && value.operationName === 'DiagnosticIoTHubEgress') {
        table.push(value);
      }
      else if(type === 3 && value.operationName === 'DiagnosticIoTHubIngress')
      {
        table.push(value);
      }
    })
    this.setState({
      storageTable: table
    });
    this.showTable();
  }

  showStorageForSingleRecord = (id) => {
    if (id && id.length > 0) {
      this.setState({
        storageTable: [this.records.get(id)]
      });
    }
    this.showTable();
  }

  showStorageForConnections = (id) => {
    var table = [];
    this.records.forEach((value, key) => {
      if ((value.operationName === 'deviceConnect' || value.operationName === 'deviceDisconnect') && value.properties.deviceId === id) {
        table.push(value);
      }
    })
    this.setState({
      storageTable: table
    });
    this.showTable(true);
  }

  getApiDomain = () => {
    if (config.apiDomain) {
      return config.apiDomain;
    }
    // let domain = "https://" + window.location.hostname;
    // return process.env.NODE_ENV === 'development' ? '' : domain;
    return '';
  }

  ElasticEaseInOut = function (t, b, c, d) {
    if ((t /= d / 2) < 1) {
      return c / 2 * t * t + b;
    }
    return -c / 2 * (--t * (t - 2) - 1) + b;
  }

  showLoading = () => {
    console.log('show loading')
    this.setState({
      loading: true
    }, () => {
      if (this.loadingRef) {
        let interval = 1;
        let degree = 0;
        let f = () => {
          degree += 360;
          console.log('f')
          this.loadingRef.to({
            rotation: degree,
            duration: interval,
            easing: this.ElasticEaseInOut,
          });
        };
        f();
        this.loadingInterval = window.setInterval(f, interval * 1000);
      }
    });
  }

  hideLoading = () => {
    this.loadingRef = undefined;
    console.log(this.loadingInterval)
    if (this.loadingInterval) window.clearInterval(this.loadingInterval);
    this.setState({
      loading: false
    });
  }

  showTable = (isConnectionLogs = false) => {
    this.setState({
      showStorageTable: true,
      showCorrelationId: !isConnectionLogs,
      showDuration: !isConnectionLogs
    });
  }

  hideTable = () => {
    this.setState({
      showStorageTable: false
    });
  }

  showTooltip = (event, tipText) => {
    this.setState({
      tooltipX: event.evt.clientX,
      tooltipY: event.evt.clientY+8,
      tooltipText: tipText,
      showTooltip: true
    });
  }

  hideTooltip = () => {
    this.setState({
      showTooltip: false,
      tooltipText: ''
    })
  }

  render() {
    let ff = 'Segoe UI';
    let leftPadding = 100;
    let rightPadding = 400;
    let timePicker = 200;
    let ch = window.innerHeight;
    let cw = window.innerWidth;
    let s = 1; //scale factor
    if (cw > 1922) {
      let space = cw - 1922;
      leftPadding += space / 2;
      rightPadding += space / 2;
    } else {
      let space = 1922 - cw;
      if (space > 300) space = 300;
      leftPadding -= space / 5;
      rightPadding -= space * 4 / 5;
    }
    if (cw < 1500) {
      s = cw / 1500;
    };
    let sf = { x: s, y: s };
    cw -= (leftPadding + rightPadding);
    let bw = cw * 0.2222 * 0.9;
    let bw_small = bw * 0.8;
    let lineSpace = (cw - bw * 2 - bw_small) / 2;
    let bh = 100;
    let b2h = 120;
    let b1x = leftPadding;
    let b1y = ch / 2;
    let b2x = leftPadding + bw + lineSpace;
    let b3x = b2x + bw + lineSpace;
    let btpw = 120;
    let btph = 40;
    let btpx = cw + leftPadding + (rightPadding - btpw) / 2;
    let tfs = 25;
    let t2fs = 15;
    let lw = 50;

    let leftLinex1 = b1x + bw;
    let leftLinex3 = b2x;
    let liney2 = b1y;
    let rightLinex1 = b2x + bw;
    let rightLinex3 = b3x;

    this.shape = { ff, ch, cw, bw, bw_small, bh, b2h, b1x, b1y, b2x, b3x, tfs, t2fs, lw, leftLinex1, leftLinex3, liney2, rightLinex1, rightLinex3 };

    let leftLineStyle = {
      progress: this.state.leftLineInAnimationProgress >= 2 ? spring(100, { stiffness: 60, damping: 15 }) : 0
    };
    let rightLineStyle = {
      progress: this.state.rightLineInAnimationProgress >= 2 ? spring(100, { stiffness: 60, damping: 15 }) : 0
    };

    let count = 0;
    let ingressAvg = Array.from(this.records.values()).reduce((acc, cur) => {
      return cur.operationName !== 'DiagnosticIoTHubIngress' ? acc : (count++, acc+cur.durationMs);
    }, 0)/count;

    let getStorageTableView = () => {
      if (this.state.showStorageTable) {
        return <div className="overlay">
          <img src={PngCloseStorageTable} width="30px" height="30px" className="png-close-storage-table-btn" onClick={this.hideTable}></img>
          <ReactTable className="-striped -highlight storage-table"
            data={this.state.storageTable}
            columns={[
              {
                Header: "correlationId",
                accessor: "correlationId",
                minWidth: 200,
                getProps: (state, rowInfo, column, instance) => ({
                  title: rowInfo ? rowInfo.row.correlationId : ""
                }),
                show: this.state.showCorrelationId
              },
              {
                Header: "category",
                accessor: "category",
                minWidth: 150,
                getProps: (state, rowInfo, column, instance) => ({
                  title: rowInfo ? rowInfo.row.category : ""
                })
              },
              {
                Header: "durationMs",
                accessor: "durationMs",
                getProps: (state, rowInfo, column, instance) => ({
                  title: rowInfo ? rowInfo.row.durationMs : ""
                }),
                show: this.state.showDuration
              },
              {
                Header: "level",
                accessor: "level",
                getProps: (state, rowInfo, column, instance) => ({
                  title: rowInfo ? rowInfo.row.level : ""
                })
              },
              {
                Header: "location",
                accessor: "location",
                getProps: (state, rowInfo, column, instance) => ({
                  title: rowInfo ? rowInfo.row.location : ""
                })
              },
              {
                Header: "operationName",
                accessor: "operationName",
                minWidth: 250,
                getProps: (state, rowInfo, column, instance) => ({
                  title: rowInfo ? rowInfo.row.operationName : ""
                })
              },
              {
                Header: "properties",
                accessor: d => d.properties.messageSize ? JSON.stringify(d.properties) : JSON.stringify(d.properties).replace(',\"messageSize":null', ''),
                id: 'properties',
                minWidth: 400,
                getProps: (state, rowInfo, column, instance) => ({
                  title: rowInfo ? rowInfo.row.properties : ""
                })
              },
              {
                Header: "resourceId",
                accessor: "resourceId",
                minWidth: 200,
                getProps: (state, rowInfo, column, instance) => ({
                  title: rowInfo ? rowInfo.row.resourceId : ""
                })
              },
              {
                Header: "time",
                accessor: d => JSON.stringify(d.time),
                id: 'time',
                minWidth: 250,
                getProps: (state, rowInfo, column, instance) => ({
                  title: rowInfo ? rowInfo.row.time : ""
                })
              }
            ]
            }
            defaultPageSize={20}
          />
        </div>;
      }
      else {
        return null;
      }
    }

    let loading = <Layer><Group>
      <Rect
        x={0}
        y={0}
        width={cw + leftPadding + rightPadding}
        height={ch}
        fill="rgba(233,233,233,0.95)"
      />
      <Arc
        ref={input => { if (!this.loadingRef) this.loadingRef = input; }}
        x={leftPadding + cw / 2}
        y={b1y}
        innerRadius={50}
        outerRadius={55}
        angle={330}
        fill="#0072c6"
      />
    </Group>
    </Layer>;

    let devices = <Group>
      <TransitionMotion
        // defaultStyles={this.getDefaultStyles(b1y)}
        styles={this.getStyles(bh, b1y, this.state.devices, this.state.leftLineInAnimationProgress, 1)}
        // willLeave={this.willLeave.bind(null, b1y)}
        willEnter={this.willEnter.bind(null, b1y)}
      >

        {
          (styles) => {
            return <Group>
              {styles.map(style => <Group key={style.data.name}><Rect
                x={b1x}
                y={style.style.y}
                width={bw}
                height={style.style.height}
                opacity={style.style.opacity}
                fill={"#fff"}
                shadowBlur={5}
                cornerRadius={5}
              />
                <KonvaImage
                  x={b1x + 8 * s}
                  y={style.style.y + 8 * s}
                  image={this.state.expand ? (style.data.diagnosticDesired !== 0 ? this.diagnosticOnImage : this.diagnosticOffImage) : null}
                  width={10 * s}
                  height={10 * s}
                />
                <Text
                  x={b1x + 20 * s}
                  y={style.style.y + 8 * s}
                  fontSize={9 * s}
                  height={9 * s}
                  fill="rgba(0,0,0,0.9)"
                  text={this.state.expand ? style.data.diagnosticDesired + '%' : ''}
                  opacity={style.style.opacity}
                  onMouseEnter={(event) => this.showTooltip(event, "E2E diagnostic sampling rate")}
                  onMouseLeave={this.hideTooltip}
                />
                <KonvaImage
                  x={b1x + 20 * s + 25 * s}
                  y={style.style.y + 8 * s}
                  image={(this.state.expand && !isNaN(style.data.onlineRatio)) ? this.onlineRatioImage : null}
                  width={10 * s}
                  height={10 * s}
                />
                <Text
                  x={b1x + 20 * s + 37 * s}
                  y={style.style.y + 8 * s}
                  fontSize={9 * s}
                  height={9 * s}
                  fill="rgba(0,0,0,0.9)"
                  text={(this.state.expand && !isNaN(style.data.onlineRatio)) ? style.data.onlineRatio + '%' : ''}
                  opacity={style.style.opacity}
                  onMouseEnter={(event) => {
                      this.showTooltip(event, "Device online rate");
                      this.changeCursorToPointer();
                    }
                  }
                  onMouseLeave={()=>{
                    this.hideTooltip();
                    this.changeCursorToDefault();
                  }}
                  onClick={this.state.sourceAI ? this.openLinkInNewPage.bind(null, this.encodeKustoQuery(
                    this.getKustoStatementForConnection(...this.getCurrentTimeWindow(), style.data.name)
                  )) : this.showStorageForConnections.bind(null, style.data.name)}
                />
                <Text
                  x={b1x}
                  y={style.style.y + style.style.height + 8 * s * 2}
                  fontSize={12 * s}
                  height={12 * s}
                  fill="rgba(0,0,0,0.7)"
                  text={this.state.expand ? '' : this.state.diagnosticOnDevices + ' device(s) with diagnostic enabled'}
                  opacity={style.style.opacity}
                />
                <Path
                  x={b1x + 20 * s}
                  y={style.style.y + (style.style.height - 26 * 1.8 * s) / 2}
                  fill={this.state.expand ? (style.data.connected ? "#0072c6" : "#aaaaaa") : (this.state.connectedDevices !== 0 ? "#0072c6" : "#aaaaaa")}
                  data={SvgChip}
                  opacity={style.style.opacity}
                  scale={{
                    x: 1.8 * s,
                    y: 1.8 * s
                  }}
                />
                <Text
                  x={b1x + 20 * s + 26 * 1.8 * s + 20 * s}
                  y={style.style.y + (style.style.height - (tfs + t2fs * 2 + 10)) / 2}
                  fontSize={tfs}
                  height={tfs}
                  scale={sf}
                  fill="rgba(0,0,0,0.9)"
                  text={style.data.name}
                  opacity={style.style.opacity}
                />

                <Text
                  x={b1x + 20 * s + 26 * 1.8 * s + 20 * s}
                  y={style.style.y + (style.style.height - (tfs + t2fs * 2 + 10)) / 2 + tfs + 5}
                  fontSize={t2fs}
                  height={t2fs}
                  scale={sf}
                  fill={"rgba(0, 0, 0, 0.65)"}
                  text={"Avg size: " + (style.data.avgSize === 0 ? '-' : this.getReadableSize(style.data.avgSize))}
                />

                <Text
                  x={b1x + 20 * s + 26 * 1.8 * s + 20 * s}
                  y={style.style.y + (style.style.height - (tfs + t2fs * 2 + 10)) / 2 + tfs + 5 + t2fs + 5}
                  fontSize={t2fs}
                  height={t2fs}
                  scale={sf}
                  fill={"rgba(0, 0, 0, 0.65)"}
                  text={"Sum: " + (style.data.avgSize * style.data.messageCount === 0 ? '-' : this.getReadableSize(style.data.avgSize * style.data.messageCount))}
                />

              </Group>)}
              {
                this.state.diagnosticOnDevices !== 0 &&
                <Group>
                  <Rect
                    x={this.state.expand ? b1x + bw - 20 : b1x + bw - tfs * s}
                    y={this.state.expand ? b1y - styles.length / 2 * bh - bh / 2 - tfs : b1y - (tfs * 0.7 * s) / 2}
                    height={tfs * s}
                    width={tfs * s}
                    onClick={this.toggleExpand}
                    onMouseEnter={() => {
                      if (this.compressRef) this.compressRef.to({ fill: 'gray', duration: 0.3 });
                      this.changeCursorToPointer();
                    }}
                    onMouseLeave={() => {
                      if (this.compressRef) this.compressRef.to({ fill: 'rgba(0,0,0,0.9)', duration: 0.3 });
                      this.changeCursorToDefault();
                    }}
                  />
                  <Path
                    x={this.state.expand ? b1x + bw - 20 : b1x + bw - tfs * s}
                    y={this.state.expand ? b1y - styles.length / 2 * bh - bh / 2 - tfs : b1y - (tfs * 0.7 * s) / 2}
                    height={tfs}
                    fill="rgba(0,0,0,0.9)"
                    opacity={styles.length === 0 ? 0 : styles[0].style.opacity}
                    data={this.state.expand ? SvgCompress : SvgExpand}
                    ref={input => { this.compressRef = input; }}
                    onClick={this.toggleExpand}
                    onMouseEnter={() => {
                      if (this.compressRef) this.compressRef.to({ fill: 'gray', duration: 0.3 });
                      this.changeCursorToPointer();
                    }}
                    onMouseLeave={() => {
                      if (this.compressRef) this.compressRef.to({ fill: 'rgba(0,0,0,0.9)', duration: 0.3 });
                      this.changeCursorToDefault();
                    }}
                    scale={{
                      x: 0.7 * s,
                      y: 0.7 * s,
                    }}
                  />
                </Group>
              }
            </Group>
          }
        }
      </TransitionMotion>
      <Motion style={leftLineStyle}>
        {
          ({ progress }) =>
            <Group>
              {Array.from(this.state.devices.values()).map((d, index) =>
                <Line
                  key={"line" + index}
                  points={this.getPointsFromProgress(progress, leftLinex1, leftLinex1 + (leftLinex3 - leftLinex1) * 0.8, leftLinex3, this.getY(b1y, index, this.state.devices.size, bh, 10), liney2)}
                  stroke="rgba(0,0,0,0.5)"
                  shadowColor="rgba(0,0,0,0.5)"
                  shadowOffsetY={3}
                  shadowBlur={3}
                />
              )}
            </Group>
        }
      </Motion>
      <TransitionMotion
        // defaultStyles={this.getDefaultNumberStyles(b1y, bh)}
        styles={this.getStyles(bh, b1y - 5, this.state.devices, this.state.leftLineInAnimationProgress, 3)}
        // willLeave={this.willLeave.bind(null, b1y)}
        willEnter={this.willEnterNumber.bind(null, ch)}>
        {
          (styles) => {
            return <Group>
              {styles.map(style =>
                <Group key={style.data.name}>
                  <Text
                    x={leftLinex1 + 10 * s}
                    y={style.style.y + (style.style.height - tfs) / 2}
                    opacity={style.style.opacity}
                    fontSize={t2fs * 0.75}
                    height={t2fs * 0.75}
                    scale={sf}
                    text={`Avg: ${style.data.messageCount === 0 ? '-' : style.data.avg.toFixed(0) + ' ms'}`}
                    onMouseEnter={this.changeCursorToPointer}
                    onMouseLeave={this.changeCursorToDefault}
                    onClick={this.state.sourceAI ? this.openLinkInNewPage.bind(null, this.encodeKustoQuery(
                      this.getKustoStatementForAvg(...this.getCurrentTimeWindow(), styles[0].data.name === 'All Devices' ? 0 : 1, style.data.name)
                    )) : this.showAllStorageTable.bind(null, styles[0].data.name === 'All Devices' ? 0 : 1, style.data.name)}
                  />
                  <Text
                    x={leftLinex1 + 10 * s + 75 * s}
                    y={style.style.y + (style.style.height - tfs) / 2}
                    opacity={style.style.opacity}
                    fontSize={t2fs * 0.75}
                    height={t2fs * 0.75}
                    scale={sf}
                    text={`Max: ${style.data.messageCount === 0 ? '-' : style.data.max.toFixed(0) + ' ms'}`}
                    onMouseEnter={this.changeCursorToPointer}
                    onMouseLeave={this.changeCursorToDefault}
                    onClick={this.state.sourceAI ? this.openLinkInNewPage.bind(null, this.encodeKustoQuery(
                      this.getKustoStatementForSingleRecord(...this.getCurrentTimeWindow(), style.data.maxId)
                    )) : this.showStorageForSingleRecord.bind(null, style.data.maxId)}
                  />
                  <Text
                    x={leftLinex1 + 10 * s + 150 * s}
                    y={style.style.y + (style.style.height - tfs) / 2}
                    opacity={style.style.opacity}
                    fontSize={t2fs * 0.75}
                    height={t2fs * 0.75}
                    scale={sf}
                    text={`Count: ${style.data.messageCount.toFixed(0)}`}
                  />
                </Group>
              )}
            </Group>
          }
        }
      </TransitionMotion>
    </Group>;

    let tooltipLayer = <Layer>
      <Label
        x={this.state.tooltipX}
        y={this.state.tooltipY}
        opacity={0.75}
        visible={this.state.showTooltip}>
        <Tag
          fill='black'
          pointerDirection='up'
          pointerWidth={10}
          pointerHeight={10}
          lineJoin='round'
          shadowColor='black'
          shadowBlur={10}
          shadowOffset={10}
          shadowOpacity={0.5}
        />
        <Text
          text={this.state.tooltipText}
          fontFamily="Calibri"
          fontSize={14}
          padding={5}
          textFill="yellow"
          fill="white"
          alpha={0.75}
        />
      </Label>
    </Layer>;

    return (
      <div>
        {getStorageTableView()}
        <Stage ref={input => { this.stageRef = input; }} width={window.innerWidth} height={window.innerHeight} >
          <Layer>
            {devices}
            <Group>
              <Rect
                x={b2x}
                y={b1y - b2h * 1.7 / 2}
                width={bw}
                height={b2h * 1.7}
                fill={"#fff"}
                shadowBlur={5}
                cornerRadius={5}
                onClick={this.toggleExpand}
              />
              <KonvaImage
                x={b2x + 20 * s}
                y={b1y - b2h * 1.7 / 2 + (b2h - lw * 1.3 * s) / 2}
                image={this.iotHubImage}
                width={lw * 1.3 * s}
                height={lw * 1.3 * s}
              />
              <Text
                x={b2x + 20 * s + lw * 1.3 * s + 20 * s}
                y={b1y - b2h * 1.7 / 2 + (b2h - 16 * s) / 2}
                fontSize={20 * s}
                height={20 * s}
                text={this.state.iotHubName.length <= 14 ? this.state.iotHubName : this.state.iotHubName.substring(0, 13) + '...'}
              />
              <Text
                x={b2x + 20 * s}
                y={b1y - b2h * 1.7 / 2 + b2h}
                fontSize={t2fs * 1.1 * s}
                height={t2fs * 1.1 * s}
                fill={"rgba(0, 0, 0, 0.65)"}
                text={"Device connected: " + this.state.connectedDevices || 0}
              />

              <Text
                x={b2x + 20 * s}
                y={b1y - b2h * 1.7 / 2 + b2h + t2fs * 1.1 * s + 5 * s}
                fontSize={t2fs * 1.1 * s}
                height={t2fs * 1.1 * s}
                fill={"rgba(0, 0, 0, 0.65)"}
                text={"Device registered: " + this.state.registeredDevices || 0}
              />

              <Text
                x={b2x + 20 * s}
                y={b1y - b2h * 1.7 / 2 + b2h + t2fs * 1.1 * 2 * s + 10 * s}
                fontSize={t2fs * 1.1 * s}
                height={t2fs * 1.1 * s}
                fill={"rgba(0, 0, 0, 0.65)"}
                text={"Unmatched messages: " + this.state.unmatchedNumber}
              />

              <Text
                x={b2x + 20 * s}
                y={b1y - b2h * 1.7 / 2 + b2h + t2fs * 1.1 * 3 * s + 15 * s}
                fontSize={t2fs * 1.1 * s}
                height={t2fs * 1.1 * s}
                fill={"rgba(0, 0, 0, 0.65)"}
                text={`Average latency: ${isNaN(ingressAvg) ? '0': ingressAvg.toFixed(0)} ms`}
                onMouseEnter={(event) => {
                  this.changeCursorToPointer();
                }
                }
                onMouseLeave={() => {
                  this.changeCursorToDefault();
                }}
                onClick={this.state.sourceAI ? this.openLinkInNewPage.bind(null, this.encodeKustoQuery(
                  this.getKustoStatementForAvg(...this.getCurrentTimeWindow(), 3)
                )) : ()=>{
                  this.showAllStorageTable(3);
                }}
              />
            </Group>

            <TransitionMotion
              // defaultStyles={this.getDefaultStyles(b1y)}
              styles={this.getStyles(bh, b1y, this.state.endpoints, this.state.rightLineInAnimationProgress, 1)}
              // willLeave={this.willLeave.bind(null, b1y)}
              willEnter={this.willEnterNumber.bind(null, b1y)}>

              {
                (styles) => {
                  let endpointImages = {
                    "EventHub": this.eventHubImage,
                    "AzureStorageContainer": this.storageImage,
                    "ServiceBusQueue": this.serviceBusImage,
                    "ServiceBusTopic": this.serviceBusImage,
                  };
                  return <Group>
                    {styles.map(style => <Group key={style.data.name}><Rect
                      x={b3x}
                      y={style.style.y}
                      width={bw_small}
                      height={style.style.height}
                      fill={"#fff"}
                      shadowBlur={5}
                      cornerRadius={5}
                    />

                      <Path
                        x={b3x + 3 * s}
                        y={style.style.y + 3 * s}
                        fill="#0072c6"
                        data={SvgEndpoint}
                        scale={{
                          x: 50 / 24 * 0.8 * s,
                          y: 50 / 26 * 0.8 * s,
                        }}
                      />

                      <KonvaImage
                        x={b3x + 20 * s}
                        y={style.style.y + (style.style.height - lw * s + 5 * s) / 2}
                        image={endpointImages[style.data.type]}
                        width={lw * 1 * s}
                        height={lw * 1 * s}
                      />

                      <Text
                        x={b3x + 20 * s + 35 * s + 20 * s}
                        y={style.style.y + (style.style.height - tfs * s) / 2}
                        fontSize={tfs * s}
                        height={tfs * s}
                        text={style.data.name.length <= 7 ? style.data.name : style.data.name.substring(0, 7) + '...'}
                      />
                    </Group>)}
                  </Group>
                }
              }
            </TransitionMotion>
            <Motion style={rightLineStyle}>
              {
                ({ progress }) =>
                  <Group>
                    {Array.from(this.state.endpoints.values()).map((d, index) =>
                      <Line
                        key={"line" + index}
                        points={this.getPointsFromProgress(progress, rightLinex1, rightLinex1 + (rightLinex3 - rightLinex1) * 0.2, rightLinex3, liney2, this.getY(b1y, index, this.state.endpoints.size, bh, 10))}
                        stroke="rgba(0,0,0,0.5)"
                        shadowColor="rgba(0,0,0,0.5)"
                        shadowOffsetY={3}
                        shadowBlur={3}
                      />
                    )}
                  </Group>
              }
            </Motion>
            <TransitionMotion
              // defaultStyles={this.getDefaultNumberStyles(b1y, bh)}
              styles={this.getStyles(bh, b1y - 5, this.state.endpoints, this.state.rightLineInAnimationProgress, 3)}
              // willLeave={this.willLeave.bind(null, b1y)}
              willEnter={this.willEnterNumber.bind(null, ch)}>
              {
                (styles) => {
                  return <Group>
                    {styles.map(style =>
                      <Group key={style.data.name}>
                        <Text
                          x={rightLinex1 + (rightLinex3 - rightLinex1) * 0.2 + 10 * s}
                          y={style.style.y + (style.style.height - tfs) / 2}
                          fontSize={t2fs * 0.75}
                          height={t2fs * 0.75}
                          scale={sf}
                          text={`Avg: ${style.data.avg.toFixed(0)} ms`}
                          onMouseEnter={this.changeCursorToPointer}
                          onMouseLeave={this.changeCursorToDefault}
                          onClick={this.state.sourceAI ? this.openLinkInNewPage.bind(null, this.encodeKustoQuery(
                            this.getKustoStatementForAvg(...this.getCurrentTimeWindow(), 2, style.data.name)
                          )) : this.showAllStorageTable.bind(null, 2, style.data.name)}
                        />
                        <Text
                          x={rightLinex1 + (rightLinex3 - rightLinex1) * 0.2 + 10 * s + 75 * s}
                          y={style.style.y + (style.style.height - tfs) / 2}
                          fontSize={t2fs * 0.75}
                          height={t2fs * 0.75}
                          scale={sf}
                          text={`Max: ${style.data.max.toFixed(0)} ms`}
                          onMouseEnter={this.changeCursorToPointer}
                          onMouseLeave={this.changeCursorToDefault}
                          onClick={this.state.sourceAI ? this.openLinkInNewPage.bind(null, this.encodeKustoQuery(
                            this.getKustoStatementForSingleRecord(...this.getCurrentTimeWindow(), style.data.maxId)
                          )) : this.showStorageForSingleRecord.bind(null, style.data.maxId)}
                        />
                        <Text
                          x={rightLinex1 + (rightLinex3 - rightLinex1) * 0.2 + 10 * s + 150 * s}
                          y={style.style.y + (style.style.height - tfs) / 2}
                          fontSize={t2fs * 0.75}
                          height={t2fs * 0.75}
                          scale={sf}
                          text={`Count: ${style.data.messageCount.toFixed(0)}`}
                        />
                      </Group>
                    )}
                  </Group>
                }
              }
            </TransitionMotion>

            <Group>
              <Rect
                x={btpx}
                y={btph}
                width={btpw}
                height={btph}
                fill={this.state.spanInMinutes === 20 ? "#e6e6e6" : "#fff"}
                shadowBlur={2}
                cornerRadius={2}
                onMouseEnter={this.changeCursorToPointer}
                onMouseLeave={this.changeCursorToDefault}
                onClick={this.changeTimeSpan.bind(null, 20)}
              />
              <Text
                x={btpx + 15}
                y={btph + 10}
                fontSize={18}
                height={18}
                text={`20 minutes`}
                onMouseEnter={this.changeCursorToPointer}
                onMouseLeave={this.changeCursorToDefault}
                onClick={this.changeTimeSpan.bind(null, 20)}
              />

              <Rect
                x={btpx}
                y={btph + btph + 10}
                width={btpw}
                height={btph}
                fill={this.state.spanInMinutes === 40 ? "#e6e6e6" : "#fff"}
                shadowBlur={2}
                cornerRadius={2}
                onMouseEnter={this.changeCursorToPointer}
                onMouseLeave={this.changeCursorToDefault}
                onClick={this.changeTimeSpan.bind(null, 40)}
              />
              <Text
                x={btpx + 15}
                y={btph + btph + 10 + 10}
                fontSize={18}
                height={18}
                text={`40 minutes`}
                onMouseEnter={this.changeCursorToPointer}
                onMouseLeave={this.changeCursorToDefault}
                onClick={this.changeTimeSpan.bind(null, 40)}
              />

              <Rect
                x={btpx}
                y={btph + btph + 10 + btph + 10}
                width={btpw}
                height={btph}
                fill={this.state.spanInMinutes === 60 ? "#e6e6e6" : "#fff"}
                shadowBlur={2}
                cornerRadius={2}
                onMouseEnter={this.changeCursorToPointer}
                onMouseLeave={this.changeCursorToDefault}
                onClick={this.changeTimeSpan.bind(null, 60)}
              />
              <Text
                x={btpx + 15}
                y={btph + btph + 10 + btph + 10 + 10}
                fontSize={18}
                height={18}
                text={`60 minutes`}
                onMouseEnter={this.changeCursorToPointer}
                onMouseLeave={this.changeCursorToDefault}
                onClick={this.changeTimeSpan.bind(null, 60)}
              />
            </Group>
          </Layer>
          {this.state.loading && loading}
          {tooltipLayer}
        </Stage>
      </div>
    );
  }
}

export default Dashboard;