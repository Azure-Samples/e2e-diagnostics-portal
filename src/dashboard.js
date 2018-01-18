import React, { Component } from 'react';
import './dashboard.scss';
import Device from './device';
import { Motion, TransitionMotion, spring, presets } from 'react-motion';
import { Stage, Layer, Group, Rect, Text, Image as KonvaImage, Path, Line } from 'react-konva';
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
      unmatchedMessageNumber: 0,
      devices: new Map(),
      toggleDevices: new Map(),
      endpoints: new Map(),
      leftLineInAnimationProgress: 0,
      rightLineInAnimationProgress: 0,
    };
    this.records = new Map();
    this.initDate = null;
    this.querySpanInSeconds = 3;
    this.spanInMinutes = 5;
    this.iotHubImage = new Image();
    this.iotHubImage.src = PngIotHub;
    this.startOfTimestamp = new Date('2018-01-17T08:00:00Z');
    ;
  }

  refresh = (firstCall, callback) => {
    let end = (new Date() - this.initDate) / 1000;
    let start = firstCall ? end - this.spanInMinutes * 60 : end - this.querySpanInSeconds;
    let records = this.records;
    fetch('/api/metric?start=' + start + '&end=' + end).then(results => results.json()).then(data => {
      let devices = this.state.expand ? this.state.devices : this.state.toggleDevices;
      let endpoints = this.state.endpoints;
      let toggleDeviceMap = this.state.expand ? this.state.toggleDevices : this.state.devices;
      let toggleDevice = toggleDeviceMap.get('All Devices') || {
        name: 'All Devices',
        avg: 0,
        max: 0,
        avgSize: 0,
        messageCount: 0,
      };

      let startDate = new Date(this.startOfTimestamp.getTime());
      let endDate = new Date(this.startOfTimestamp.getTime());
      startDate.setSeconds(startDate.getSeconds() + start - this.spanInMinutes * 60);
      endDate.setSeconds(endDate.getSeconds() + end);

      let toggleDeviceCount = 0;
      let toggleDeviceMax = 0;
      let toggleDeviceSum = 0;
      let toggleDeviceSumSize = 0;
      for (let item of data.value) {
        item.durationMs = parseFloat(item.durationMs);
        item.properties = JSON.parse(item.properties);
        item.properties.messageSize = parseFloat(item.properties.messageSize);
        if (!records.has(item.correlationId)) {
          records.set(item.correlationId, item);
          if (item.operationName === 'DiagnosticIoTHubRouting') {
            if (endpoints.has(item.properties.endpointName)) {
              let value = endpoints.get(item.properties.endpointName);
              if (item.durationMs > value.max) {
                value.max = item.durationMs;
              }
              value.avg = (value.avg * value.messageCount + item.durationMs) / (value.messageCount + 1);
              value.messageCount++;
              endpoints.set(item.properties.endpointName, value);
            } else {
              let value = {
                name: item.properties.endpointName,
                avg: item.durationMs,
                max: item.durationMs,
                messageCount: 1
              }
              endpoints.set(item.properties.endpointName, value);
            }
          } else if (item.operationName === 'DiagnosticIoTHubIngress') {
            if (devices.has(item.properties.deviceId)) {
              let value = devices.get(item.properties.deviceId);
              if (item.durationMs > value.max) {
                value.max = item.durationMs;
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
                avgSize: item.properties.messageSize,
                messageCount: 1
              }
              devices.set(item.properties.deviceId, value);
            }
            toggleDeviceCount++;
            toggleDeviceSum += item.durationMs;
            toggleDeviceSumSize += item.properties.messageSize;
            if (item.durationMs > toggleDeviceMax) toggleDeviceMax = item.durationMs;
          }

        }
      }

      let recordKeysToDelete = [];
      let deviceKeysToDelete = [];
      let endpointKeysToDelete = [];

      for (let [k, v] of records) {
        if (v.time < startDate || v.time > endDate) {
          recordKeysToDelete.push(k);
          if (item.operationName === 'DiagnosticIoTHubRouting') {
            let value = endpoints.get(v.properties.endpointName);
            if (value.messageCount === 1) {
              endpointKeysToDelete.push(value.name);
              value.messageCount = 0;
              endpoints.set(v.properties.endpointName, value);
            } else {
              // TODO: HANDLE WHEN MAX DELETED
              value.avg = (value.avg * value.messageCount - v.durationMs) / (value.messageCount - 1);
              value.messageCount--;
              endpoints.set(v.properties.endpointName, value);
            }
          } else if (item.operationName === 'DiagnosticIoTHubIngress') {
            let value = devices.get(v.properties.deviceId);
            if (value.messageCount === 1) {
              deviceKeysToDelete.push(value.name);
              value.messageCount = 0;
              devices.set(v.properties.deviceId, value);
            } else {
              // TODO: HANDLE WHEN MAX DELETED
              value.avg = (value.avg * value.messageCount - v.durationMs) / (value.messageCount - 1);
              value.messageCount--;
              devices.set(v.properties.deviceId, value);
            }
            toggleDeviceCount--;
            toggleDeviceSum -= v.durationMs;
          }
        }
      }

      toggleDevice.avg = (toggleDevice.avg * toggleDevice.messageCount + toggleDeviceSum) / (toggleDevice.messageCount + toggleDeviceCount);
      toggleDevice.avgSize = (toggleDevice.avgSize * toggleDevice.messageCount + toggleDeviceSumSize) / (toggleDevice.messageCount + toggleDeviceCount);
      toggleDevice.messageCount += toggleDeviceCount;
      toggleDevice.max = toggleDeviceMax;
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

      let stateToSet = {
        endpoints,
      };
      if (this.state.expand) {
        stateToSet.devices = devices;
        stateToSet.toggleDevices = toggleDeviceMap;
      } else {
        stateToSet.toggleDevices = devices;
        stateToSet.devices = toggleDeviceMap;
      }

      this.setState(stateToSet, callback);
    });
  }

  componentDidMount() {
    this.initDate = new Date();

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


    // this.refreshInterval = setInterval(()=>{
    //   this.refresh(false, ()=>{
    //   });
    // },this.querySpanInSeconds * 1000)
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
    } else {
      return [x1, y1, x2, y1, x2, y2, x2 + currentDistance - dist1 - dist2, y2];
    }
  }

  getReadableSize = (num) => {
    if(num <1024) {
      return num.toFixed(0) + " Bytes";
    }else if(num < 1024*1024) {
      return (num / 1024).toFixed(0) + " KB";
    }else {
      return (num / 1024 / 1024).toFixed(0) + " MB";
    }
  }

  render() {
    let ff = "Segoe UI";
    let sidebar = 50;
    let ch = window.innerHeight;
    let cw = window.innerWidth - sidebar;
    let bw = cw * 0.2222;
    let bw_small = bw * 0.75;
    let bh = 100;
    let b2h = 120;
    let b1x = 50;
    let b1y = ch / 2 - bh / 2;
    let b2x = cw / 2 - bw / 2;
    let b3x = cw - b1x - bw_small;
    let tfs = 25;
    let t2fs = 15;
    let lw = 50;

    let leftLinex1 = b1x + (this.state.expand ? bw_small : bw * 0.9);
    let leftLinex3 = b2x;
    let liney2 = b1y;
    let rightLinex1 = b2x + bw;
    let rightLinex3 = b3x;

    this.shape = { ff, sidebar, ch, cw, bw, bw_small, bh, b2h, b1x, b1y, b2x, b3x, tfs, t2fs, lw, leftLinex1, leftLinex3, liney2, rightLinex1, rightLinex3 };

    let progress;
    if (this.state.leftLineInAnimationProgress >= 2) {
      progress = spring(100, { stiffness: 60, damping: 15 });
    } else if (this.state.leftLineInAnimationProgress <= -2) {
      progress = spring(0, { stiffness: 60, damping: 15 });
    } else {
      progress = 0;
    }
    let leftLineStyle = {
      progress
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
                width={this.state.expand ? bw_small : bw * 0.9}
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
                  y={style.style.y + (style.style.height -(tfs+t2fs*2 +10)) / 2}
                  fontSize={tfs}
                  height={tfs}
                  fill="rgba(0,0,0,0.9)"
                  text={style.data.name}
                  opacity={style.style.opacity}
                />

                <Text
                  x={b1x + 20 + lw + 20}
                  y={style.style.y + (style.style.height -(tfs+t2fs*2 +10)) / 2 + tfs + 5}
                  fontSize={t2fs}
                  height={t2fs}
                  fill={"rgba(0, 0, 0, 0.65)"}
                  text={"Avg size: " + this.getReadableSize(style.data.avgSize)}
                />

                <Text
                  x={b1x + 20 + lw + 20}
                  y={style.style.y + (style.style.height -(tfs+t2fs*2 +10)) / 2 + tfs + 5 + t2fs + 5}
                  fontSize={t2fs}
                  height={t2fs}
                  fill={"rgba(0, 0, 0, 0.65)"}
                  text={"Sum: " + this.getReadableSize(style.data.avgSize * style.data.messageCount)}
                />

              </Group>)}
              <Group>
                <Rect
                  x={this.state.expand ? b1x + bw_small - 20 : b1x + bw * 0.9 - tfs}
                  y={this.state.expand ? b1y - styles.length / 2 * bh - bh / 2 - tfs : b1y - (tfs * 0.7) / 2}
                  height={tfs}
                  width={tfs}
                  onClick={this.toggleExpand}
                  onMouseEnter={() => {
                    if (this.compressRef) this.compressRef.to({ fill: 'gray', duration: 0.3 });
                    if (this.stageRef && this.stageRef._stage && this.stageRef._stage.content && this.stageRef._stage.content.style) {
                      this.stageRef._stage.content.style.cursor = 'pointer';
                    }
                  }}
                  onMouseLeave={() => {
                    if (this.compressRef) this.compressRef.to({ fill: 'rgba(0,0,0,0.9)', duration: 0.3 });
                    if (this.stageRef && this.stageRef._stage && this.stageRef._stage.content && this.stageRef._stage.content.style) {
                      this.stageRef._stage.content.style.cursor = 'default';
                    }
                  }}
                />
                <Path
                  x={this.state.expand ? b1x + bw_small - 20 : b1x + bw * 0.9 - tfs}
                  y={this.state.expand ? b1y - styles.length / 2 * bh - bh / 2 - tfs : b1y - (tfs * 0.7) / 2}
                  height={tfs}
                  fill="rgba(0,0,0,0.9)"
                  opacity={styles.length === 0 ? 0 : styles[0].style.opacity}
                  data={this.state.expand ? SvgCompress : SvgExpand}
                  ref={input => { this.compressRef = input; }}
                  onClick={this.toggleExpand}
                  onMouseEnter={() => {
                    if (this.compressRef) this.compressRef.to({ fill: 'gray', duration: 0.3 });
                    if (this.stageRef && this.stageRef._stage && this.stageRef._stage.content && this.stageRef._stage.content.style) {
                      this.stageRef._stage.content.style.cursor = 'pointer';
                    }
                  }}
                  onMouseLeave={() => {
                    if (this.compressRef) this.compressRef.to({ fill: 'rgba(0,0,0,0.9)', duration: 0.3 });
                    if (this.stageRef && this.stageRef._stage && this.stageRef._stage.content && this.stageRef._stage.content.style) {
                      this.stageRef._stage.content.style.cursor = 'default';
                    }
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
          function (styles) {
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
                  />
                  <Text
                    x={leftLinex1 + 10 + 75}
                    y={style.style.y + (style.style.height - tfs) / 2}
                    opacity={style.style.opacity}
                    fontSize={t2fs * 0.75}
                    height={t2fs * 0.75}
                    text={`Max: ${style.data.max.toFixed(0)} ms`}
                  />
                  <Text
                    x={leftLinex1 + 10 + 150}
                    y={style.style.y + (style.style.height - tfs) / 2}
                    opacity={style.style.opacity}
                    fontSize={t2fs * 0.75}
                    height={t2fs * 0.75}
                    text={`Num: ${style.data.messageCount.toFixed(0)}`}
                  />
                </Group>
              )}
            </Group>
          }
        }
      </TransitionMotion>
    </Group>;

    return (
      <Stage ref={input => { this.stageRef = input; }} width={cw} height={ch}>
        <Layer>
          {devices}
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
            text="Device connected: 2"
          />
          <Text
            x={b2x + 20}
            y={b1y - b2h * 1.7 / 2 + b2h + t2fs + 5}
            fontSize={t2fs}
            height={t2fs}
            fill={"rgba(0, 0, 0, 0.65)"}
            text="Device registered: 6"
          />
          <Text
            x={b2x + 20}
            y={b1y - b2h * 1.7 / 2 + b2h + t2fs * 2 + 10}
            fontSize={t2fs}
            height={t2fs}
            fill={"rgba(0, 0, 0, 0.65)"}
            text="Unmatched messages: 10"
          />

          <TransitionMotion
            // defaultStyles={this.getDefaultStyles(b1y)}
            styles={this.getStyles(bh, b1y, this.state.endpoints, this.state.rightLineInAnimationProgress, 1)}
            willLeave={this.willLeave.bind(null, b1y)}
            willEnter={this.willEnter.bind(null, b1y)}>

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
            willLeave={this.willLeave.bind(null, b1y)}
            willEnter={this.willEnterNumber.bind(null, ch)}>
            {
              function (styles) {
                return <Group>
                  {styles.map(style =>
                    <Group key={style.data.name}>
                      <Text
                        x={rightLinex1 + (rightLinex3 - rightLinex1) * 0.2 + 10}
                        y={style.style.y + (style.style.height - tfs) / 2}
                        fontSize={t2fs * 0.75}
                        height={t2fs * 0.75}
                        text={`Avg: ${style.data.avg.toFixed(0)} ms`}
                      />
                      <Text
                        x={rightLinex1 + (rightLinex3 - rightLinex1) * 0.2 + 10 + 75}
                        y={style.style.y + (style.style.height - tfs) / 2}
                        fontSize={t2fs * 0.75}
                        height={t2fs * 0.75}
                        text={`Max: ${style.data.max.toFixed(0)} ms`}
                      />
                      <Text
                        x={rightLinex1 + (rightLinex3 - rightLinex1) * 0.2 + 10 + 150}
                        y={style.style.y + (style.style.height - tfs) / 2}
                        fontSize={t2fs * 0.75}
                        height={t2fs * 0.75}
                        text={`Num: ${style.data.messageCount.toFixed(0)}`}
                      />
                    </Group>
                  )}
                </Group>
              }
            }
          </TransitionMotion>
        </Layer>
      </Stage>
    );
  }
}

export default Dashboard;