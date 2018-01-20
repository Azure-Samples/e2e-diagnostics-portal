import React, { Component } from 'react';
import './dashboard.scss';
import Device from './device';
import gzip from 'gzip-js';
import { Motion, TransitionMotion, spring, presets } from 'react-motion';
import { Stage, Layer, Group, Rect, Text, Image as KonvaImage, Path, Line } from 'react-konva';
import config from '../config';
import util from 'util';
import SvgChip from '../asset/microchip.svg';
import PngIotHub from '../asset/iothub.png';
import SvgExpand from '../asset/expand.svg';
import SvgEndpoint from '../asset/endpoint.svg';
import SvgCompress from '../asset/compress.svg';
import { setInterval } from 'timers';

class Dashboard extends Component {
  constructor(props) {
    super(props);
    this.state = {
      expand: false,
      connectedDevices: undefined,
      registeredDevices: undefined,
      devices: new Map(),
      toggleDevices: new Map(),
      endpoints: new Map(),
      unmatchedNumber: 0,
      leftLineInAnimationProgress: 0,
      rightLineInAnimationProgress: 0,
      spanInMinutes: 5,
    };
    this.records = new Map();
    this.unmatchedMap = new Map();
    this.initDate = null;
    this.queryMetricSpanInSeconds = 3;
    this.queryDeviceSpanInSeconds = 2;
    this.iotHubImage = new Image();
    this.iotHubImage.src = PngIotHub;
    this.startOfTimestamp = new Date(config.startTime);
    this.kustoLinkTemplate = "https://analytics.applicationinsights.io/subscriptions/faab228d-df7a-4086-991e-e81c4659d41a/resourcegroups/mj-prod/components/amai?q=%s&apptype=other&timespan=P1D";
  }

  getDeviceNumber = () => {
    fetch(config.api + '/api/device').then(results => results.json()).then(data => {
      this.setState({
        connectedDevices: data.connected,
        registeredDevices: data.registered,
      });
    }).catch((e) => {
      console.log('Fetching device status error.', e.message);
    })
  }

  getCurrentTimeWindow = () => {
    let end = (new Date() - this.initDate) / 1000;
    let startDate = new Date(this.startOfTimestamp.getTime());
    let endDate = new Date(this.startOfTimestamp.getTime());
    startDate.setSeconds(startDate.getSeconds() + end - this.state.spanInMinutes * 60);
    endDate.setSeconds(endDate.getSeconds() + end);
    return [startDate, endDate];
  }

  refresh = (firstCall, callback) => {
    if (firstCall) {
      this.initDate = new Date();
      this.reset();
    }
    let end = (new Date() - this.initDate) / 1000;
    let start = firstCall ? end - this.state.spanInMinutes * 60 : end - this.queryMetricSpanInSeconds;
    let records = this.records;
    fetch(config.api + '/api/metric?start=' + start + '&end=' + end).then(results => results.json()).then(data => {
      let devices = this.state.expand ? this.state.devices : this.state.toggleDevices;
      let endpoints = this.state.endpoints;
      let toggleDeviceMap = this.state.expand ? this.state.toggleDevices : this.state.devices;
      let unmatched = this.unmatchedMap;
      let toggleDevice = toggleDeviceMap.get('All Devices') || {
        name: 'All Devices',
        avg: 0,
        max: 0,
        maxId: "",
        avgSize: 0,
        messageCount: 0,
      };

      let [startDate, endDate] = this.getCurrentTimeWindow();

      let toggleDeviceCount = 0;
      let toggleDeviceMax = 0;
      let toggleDeviceMaxId = "";
      let toggleDeviceSum = 0;
      let toggleDeviceSumSize = 0;
      let p1 = performance.now();
      for (let item of data.value) {
        if (!records.has(item.correlationId)) {
          let correlationPrefix = item.correlationId.substring(8, 16);
          item.durationMs = parseFloat(item.durationMs);
          item.time = new Date(item.time);
          try {
            item.properties = JSON.parse(item.properties);
          } catch (e) {
            continue;
          }
          item.properties.messageSize = parseFloat(item.properties.messageSize);
          records.set(item.correlationId, item);
          if (item.operationName === 'DiagnosticIoTHubRouting') {
            if (endpoints.has(item.properties.endpointName)) {
              let value = endpoints.get(item.properties.endpointName);
              if (item.durationMs > value.max) {
                value.max = item.durationMs;
                value.maxId = item.correlationId;
              }
              value.avg = (value.avg * value.messageCount + item.durationMs) / (value.messageCount + 1);
              value.messageCount++;
              endpoints.set(item.properties.endpointName, value);
            } else {
              let value = {
                name: item.properties.endpointName,
                avg: item.durationMs,
                max: item.durationMs,
                maxId: item.correlationId,
                messageCount: 1
              }
              endpoints.set(item.properties.endpointName, value);
            }
            unmatched.set(correlationPrefix, false);
          } else if (item.operationName === 'DiagnosticIoTHubIngress') {
            if (devices.has(item.properties.deviceId)) {
              let value = devices.get(item.properties.deviceId);
              if (item.durationMs > value.max) {
                value.max = item.durationMs;
                value.maxId = item.correlationId;
              }
              value.avg = (value.avg * value.messageCount + item.durationMs) / (value.messageCount + 1);
              value.avgSize = (value.avgSize * value.messageCount + item.properties.messageSize) / (value.messageCount + 1);
              value.messageCount++;
              devices.set(item.properties.deviceId, value);
            } else {
              let value = {
                name: item.properties.deviceId,
                avg: item.durationMs,
                max: item.durationMs,
                maxId: item.correlationId,
                avgSize: item.properties.messageSize,
                messageCount: 1
              }
              devices.set(item.properties.deviceId, value);
            }

            if (!unmatched.has(correlationPrefix)) {
              unmatched.set(correlationPrefix, true);
            }
          }

        }
      }

      let recordKeysToDelete = [];
      let deviceKeysToDelete = [];
      let endpointKeysToDelete = [];
      let updateMaxDevicesMap = new Map();
      let updateMaxEndpointsMap = new Map();
      for (let [k, v] of records) {
        if (v.time < startDate || v.time > endDate) {
          let correlationPrefix = v.correlationId.substring(8, 16);
          unmatched.delete(correlationPrefix);
          recordKeysToDelete.push(k);
          if (v.operationName === 'DiagnosticIoTHubRouting') {
            let value = endpoints.get(v.properties.endpointName);
            if (value.messageCount === 1) {
              endpointKeysToDelete.push(value.name);
              value.messageCount = 0;
              endpoints.set(v.properties.endpointName, value);
            } else {
              if (value.max === v.max) {
                value.maxId = "";
                value.max = 0;
                updateMaxEndpointsMap.set(value.name, true);
              }
              value.avg = (value.avg * value.messageCount - v.durationMs) / (value.messageCount - 1);
              value.messageCount--;
              endpoints.set(v.properties.endpointName, value);
            }
          } else if (v.operationName === 'DiagnosticIoTHubIngress') {
            let value = devices.get(v.properties.deviceId);
            if (value.messageCount === 1) {
              deviceKeysToDelete.push(value.name);
              value.messageCount = 0;
              devices.set(v.properties.deviceId, value);
            } else {
              if (value.max === v.max) {
                value.maxId = "";
                value.max = 0;
                updateMaxDevicesMap.set(value.name, true);
              }
              value.avg = (value.avg * value.messageCount - v.durationMs) / (value.messageCount - 1);
              value.messageCount--;
              devices.set(v.properties.deviceId, value);
            }
          }
        }
      }

      for (let [k, v] of records) {
        if (v.operationName === 'DiagnosticIoTHubRouting') {
          if (updateMaxEndpointsMap.has(v.properties.endpointName)) {
            if (v.durationMs > endpoints.get(v.properties.endpointName).max) {
              let ep = endpoints.get(v.properties.endpointName);
              ep.max = v.durationMs;
              ep.maxId = v.correlationId;
              endpoints.set(v.properties.endpointName, ep);
            }
          }
        }
        else if (v.operationName === 'DiagnosticIoTHubIngress') {
          if (updateMaxDevicesMap.has(v.properties.deviceId)) {
            if (v.durationMs > devices.get(v.properties.deviceId).max) {
              let ep = devices.get(v.properties.deviceId);
              ep.max = v.durationMs;
              ep.maxId = v.correlationId;
              devices.set(v.properties.deviceId, ep);
            }
          }
          if (v.durationMs > toggleDeviceMax) {
            toggleDeviceMax = v.durationMs;
            toggleDeviceMaxId = v.correlationId;
          }
          toggleDeviceCount++;
          toggleDeviceSum += v.durationMs;
          toggleDeviceSumSize += v.properties.messageSize;
        }
      }

      toggleDevice.avg = toggleDeviceSum / toggleDeviceCount;
      toggleDevice.avgSize = toggleDeviceSumSize / toggleDeviceCount;
      toggleDevice.messageCount = toggleDeviceCount;
      toggleDevice.max = toggleDeviceMax;
      toggleDevice.maxId = toggleDeviceMaxId;
      toggleDeviceMap.set('All Devices', toggleDevice);

      for (let key of recordKeysToDelete) {
        records.delete(key);
      }
      for (let key of deviceKeysToDelete) {
        devices.delete(key);
      }
      for (let key of endpointKeysToDelete) {
        endpoints.delete(key);
      }

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
    });
  }

  componentDidMount() {
    this.refresh(true, () => {
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
    });


    this.refreshInterval = setInterval(() => {
      this.refresh(false, () => {
      });
    }, this.queryMetricSpanInSeconds * 1000)

    this.getDeviceNumber();
    this.getDeviceNumberInterval = setInterval(this.getDeviceNumber, this.queryDeviceSpanInSeconds * 1000);
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
      return num.toFixed(0) + " Bytes";
    } else if (num < 1024 * 1024) {
      return (num / 1024).toFixed(0) + " KB";
    } else {
      return (num / 1024 / 1024).toFixed(0) + " MB";
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

  changeTimeSpan = (span) => {
    if (this.state.spanInMinutes !== span) {
      this.setState({
        spanInMinutes: span
      }, () => {
        this.refresh(true, () => {
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
        });
      });
    }
  }

  reset = () => {
    this.setState({
      expand: false,
      devices: new Map(),
      toggleDevices: new Map(),
      endpoints: new Map(),
      unmatchedNumber: 0,
      leftLineInAnimationProgress: 0,
      rightLineInAnimationProgress: 0,
    })
    this.records = new Map();
    this.unmatchedMap = new Map();
  }

  encodeKustoQuery = (query) => {
    let s1 = query + "\n";
    let s2 = gzip.zip(s1);
    let s3 = String.fromCharCode(...s2);
    let s4 = btoa(s3);
    return util.format(this.kustoLinkTemplate, encodeURIComponent(s4));
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
    }

    return `customEvents | where timestamp >= datetime('${start.toISOString()}') and timestamp <= datetime('${end.toISOString()}') and customDimensions.properties contains ${condition}`;
  }

  getKustoStatementForSingleRecord = (correlationId) => {
    return `customEvents | where customDimensions.correlationId contains '${correlationId}'`;
  }

  openLinkInNewPage = (link) => {
    window.open(link);
  }

  render() {
    let ff = "Segoe UI";
    let leftPadding = 100;
    let rightPadding = 400;
    let timePicker = 200;
    let ch = window.innerHeight;
    let cw = window.innerWidth - leftPadding - rightPadding;
    if (cw > 1422) {
      let space = cw - 1422;
      leftPadding += space / 2;
      rightPadding += space / 2;
      cw -= space;
    }
    let bw = cw * 0.2222 * 0.9;
    let bw_small = bw * 0.8;
    let lineSpace = (cw - bw * 2 - bw_small) / 2;
    let bh = 100;
    let b2h = 120;
    let b1x = leftPadding;
    let b1y = ch / 2 - bh / 2;
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
                <Path
                  x={b1x + 20}
                  y={style.style.y + (style.style.height - lw) / 2}
                  fill="#0072c6"
                  data={SvgChip}
                  opacity={style.style.opacity}
                  scale={{
                    x: lw / 24 * 1,
                    y: lw / 26 * 1,
                  }}
                />
                <Text
                  x={b1x + 20 + lw + 20}
                  y={style.style.y + (style.style.height - (tfs + t2fs * 2 + 10)) / 2}
                  fontSize={tfs}
                  height={tfs}
                  fill="rgba(0,0,0,0.9)"
                  text={style.data.name}
                  opacity={style.style.opacity}
                />

                <Text
                  x={b1x + 20 + lw + 20}
                  y={style.style.y + (style.style.height - (tfs + t2fs * 2 + 10)) / 2 + tfs + 5}
                  fontSize={t2fs}
                  height={t2fs}
                  fill={"rgba(0, 0, 0, 0.65)"}
                  text={"Avg size: " + this.getReadableSize(style.data.avgSize)}
                />

                <Text
                  x={b1x + 20 + lw + 20}
                  y={style.style.y + (style.style.height - (tfs + t2fs * 2 + 10)) / 2 + tfs + 5 + t2fs + 5}
                  fontSize={t2fs}
                  height={t2fs}
                  fill={"rgba(0, 0, 0, 0.65)"}
                  text={"Sum: " + this.getReadableSize(style.data.avgSize * style.data.messageCount)}
                />

              </Group>)}
              <Group>
                <Rect
                  x={this.state.expand ? b1x + bw - 20 : b1x + bw - tfs}
                  y={this.state.expand ? b1y - styles.length / 2 * bh - bh / 2 - tfs : b1y - (tfs * 0.7) / 2}
                  height={tfs}
                  width={tfs}
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
                  x={this.state.expand ? b1x + bw - 20 : b1x + bw - tfs}
                  y={this.state.expand ? b1y - styles.length / 2 * bh - bh / 2 - tfs : b1y - (tfs * 0.7) / 2}
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
                    x: 0.7,
                    y: 0.7,
                  }}
                />
              </Group>
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
                    x={leftLinex1 + 10}
                    y={style.style.y + (style.style.height - tfs) / 2}
                    opacity={style.style.opacity}
                    fontSize={t2fs * 0.75}
                    height={t2fs * 0.75}
                    text={`Avg: ${style.data.avg.toFixed(0)} ms`}
                    onMouseEnter={this.changeCursorToPointer}
                    onMouseLeave={this.changeCursorToDefault}
                    onClick={this.openLinkInNewPage.bind(null, this.encodeKustoQuery(
                      this.getKustoStatementForAvg(...this.getCurrentTimeWindow(), styles[0].data.name === 'All Devices' ? 0 : 1, style.data.name)
                    ))}
                  />
                  <Text
                    x={leftLinex1 + 10 + 75}
                    y={style.style.y + (style.style.height - tfs) / 2}
                    opacity={style.style.opacity}
                    fontSize={t2fs * 0.75}
                    height={t2fs * 0.75}
                    text={`Max: ${style.data.max.toFixed(0)} ms`}
                    onMouseEnter={this.changeCursorToPointer}
                    onMouseLeave={this.changeCursorToDefault}
                    onClick={this.openLinkInNewPage.bind(null, this.encodeKustoQuery(
                      this.getKustoStatementForSingleRecord(style.data.maxId.substring(8, 16))
                    ))}
                  />
                  <Text
                    x={leftLinex1 + 10 + 150}
                    y={style.style.y + (style.style.height - tfs) / 2}
                    opacity={style.style.opacity}
                    fontSize={t2fs * 0.75}
                    height={t2fs * 0.75}
                    text={`Count: ${style.data.messageCount.toFixed(0)}`}
                  />
                </Group>
              )}
            </Group>
          }
        }
      </TransitionMotion>
    </Group>;

    return (
      <Stage ref={input => { this.stageRef = input; }} width={window.innerWidth} height={window.innerHeight}>
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
              x={b2x + 20}
              y={b1y - b2h * 1.7 / 2 + (b2h - lw * 1.3) / 2}
              image={this.iotHubImage}
              width={lw * 1.3}
              height={lw * 1.3}
            />
            <Text
              x={b2x + 20 + lw * 1.3 + 20}
              y={b1y - b2h * 1.7 / 2 + (b2h - lw * 1.3) / 2}
              fontSize={35}
              height={35}
              text="IoT Hub"
            />
            <Text
              x={b2x + 20}
              y={b1y - b2h * 1.7 / 2 + b2h}
              fontSize={t2fs}
              height={t2fs}
              fill={"rgba(0, 0, 0, 0.65)"}
              text={"Device connected: " + this.state.connectedDevices || 0}
            />

            <Text
              x={b2x + 20}
              y={b1y - b2h * 1.7 / 2 + b2h + t2fs + 5}
              fontSize={t2fs}
              height={t2fs}
              fill={"rgba(0, 0, 0, 0.65)"}
              text={"Device registered: " + this.state.registeredDevices || 0}
            />


            <Text
              x={b2x + 20}
              y={b1y - b2h * 1.7 / 2 + b2h + t2fs * 2 + 10}
              fontSize={t2fs}
              height={t2fs}
              fill={"rgba(0, 0, 0, 0.65)"}
              text={"Unmatched messages: " + this.state.unmatchedNumber}
            />
          </Group>

          <TransitionMotion
            // defaultStyles={this.getDefaultStyles(b1y)}
            styles={this.getStyles(bh, b1y, this.state.endpoints, this.state.rightLineInAnimationProgress, 1)}
            // willLeave={this.willLeave.bind(null, b1y)}
            willEnter={this.willEnterNumber.bind(null, b1y)}>

            {
              function (styles) {
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
                      x={b3x + 20}
                      y={style.style.y + (style.style.height - 35) / 2}
                      fill="#0072c6"
                      data={SvgEndpoint}
                      scale={{
                        x: 50 / 24 * 1.3,
                        y: 50 / 26 * 1.3,
                      }}
                    />
                    <Text
                      x={b3x + 20 + 35 + 20}
                      y={style.style.y + (style.style.height - tfs) / 2}
                      fontSize={tfs}
                      height={tfs}
                      text={style.data.name}
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
                        x={rightLinex1 + (rightLinex3 - rightLinex1) * 0.2 + 10}
                        y={style.style.y + (style.style.height - tfs) / 2}
                        fontSize={t2fs * 0.75}
                        height={t2fs * 0.75}
                        text={`Avg: ${style.data.avg.toFixed(0)} ms`}
                        onMouseEnter={this.changeCursorToPointer}
                        onMouseLeave={this.changeCursorToDefault}
                        onClick={this.openLinkInNewPage.bind(null, this.encodeKustoQuery(
                          this.getKustoStatementForAvg(...this.getCurrentTimeWindow(), 2, style.data.name)
                        ))}
                      />
                      <Text
                        x={rightLinex1 + (rightLinex3 - rightLinex1) * 0.2 + 10 + 75}
                        y={style.style.y + (style.style.height - tfs) / 2}
                        fontSize={t2fs * 0.75}
                        height={t2fs * 0.75}
                        text={`Max: ${style.data.max.toFixed(0)} ms`}
                        onMouseEnter={this.changeCursorToPointer}
                        onMouseLeave={this.changeCursorToDefault}
                        onClick={this.openLinkInNewPage.bind(null, this.encodeKustoQuery(
                          this.getKustoStatementForSingleRecord(style.data.maxId.substring(8, 16))
                        ))}
                      />
                      <Text
                        x={rightLinex1 + (rightLinex3 - rightLinex1) * 0.2 + 10 + 150}
                        y={style.style.y + (style.style.height - tfs) / 2}
                        fontSize={t2fs * 0.75}
                        height={t2fs * 0.75}
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
              fill={this.state.spanInMinutes === 5 ? "#e6e6e6" : "#fff"}
              shadowBlur={2}
              cornerRadius={2}
              onMouseEnter={this.changeCursorToPointer}
              onMouseLeave={this.changeCursorToDefault}
              onClick={this.changeTimeSpan.bind(null, 5)}
            />
            <Text
              x={btpx + 15}
              y={btph + 10}
              fontSize={18}
              height={18}
              text={`5 minutes`}
              onMouseEnter={this.changeCursorToPointer}
              onMouseLeave={this.changeCursorToDefault}
              onClick={this.changeTimeSpan.bind(null, 5)}
            />

            <Rect
              x={btpx}
              y={btph + btph + 10}
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
              y={btph + btph + 10 + 10}
              fontSize={18}
              height={18}
              text={`20 minutes`}
              onMouseEnter={this.changeCursorToPointer}
              onMouseLeave={this.changeCursorToDefault}
              onClick={this.changeTimeSpan.bind(null, 20)}
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
      </Stage>
    );
  }
}

export default Dashboard;