import React, { Component } from 'react';
import './device.scss';

class Device extends Component {
  constructor(props) {
    super(props);
  }

  render() {
    return <div className="block" style={this.props.style}>
          <div className="logo">
            <i className="fa fa-microchip" aria-hidden="true"></i>
          </div>
          <div className="info">
            <div className="name">{this.props.name}</div>
            <div className="aggregation">
              <div className="avg">Avg: {this.props.avg}ms</div>
              <div className="max">Max: {this.props.max}ms</div>
            </div>
          </div>
        </div>
  }
}

export default Device;