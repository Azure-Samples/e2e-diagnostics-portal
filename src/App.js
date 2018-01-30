import React, { Component } from 'react';
import {
  BrowserRouter,
  Route,
  Link
} from 'react-router-dom';
import './App.scss';
import Dashboard from './dashboard';

class App extends Component {
  constructor(props) {
    super(props);
    this.state = {
      showSideBar: true
    }
  }

  showSideBar = (show) => {
    console.log(show);
    this.setState({
      showSideBar: show
    });
  }

  render() {
    return (
      <BrowserRouter>
        <div className="true-root">
          {/* <div className={`sidebar ${this.state.showSideBar ? '' : 'sidebar-hide'}`}>
            <Link to="/"><i className="fa fa-tachometer" aria-hidden="true"></i></Link>
            <Link to="/c"><i className="fa fa-cog" aria-hidden="true"></i></Link>
          </div> */}
          <div className="main">
            <Route path="/" exact render={() => <Dashboard showSideBar={this.showSideBar}/>} />
            {/* <Route path="/c" render={() => <KeywordContainer showSideBar={this.showSideBar}/>} /> */}
          </div>

        </div>
      </BrowserRouter>
    );
  }
}

export default App;
