import React from 'react';
import JWMoviePlayer from "./players/jwmovieplayer.js";
import IFramePlayer from "./players/iframe.js";

function processSources(sources) {
    let processSources = []
    sources.forEach(source => {
        if(!source["src"] || !source["type"])
            return;

        let src = source["src"].replace(/^(http:)?\/\//, "https://");
        let type = source["type"].includes("mp4") ? "video/mp4" : (source["type"].includes("hls") ? "application/x-mpegURL" : null);
        let label = source["label"] ? source["label"] : "MOV";
        if(src && type && label) {
            processSources.push({
                src: src,
                type: type,
                label: label
            });
        }
    });
    return processSources;
}

function getVideoServerName(src) {
    if(src.includes("google.com"))
        return "GO"; 
    return "UNK"; // unknown

}

export default class Movie extends React.Component {

    constructor(props) {
        super(props);
        this.state = {movieId: null, 
                      movieInfo: {}, 
                      instances: {}, 
                      selection: null, 
                      episodeSelection: 0, 
                      mediaCache: {}, 
                      serverSelection: null,
                      movieSrcs: [],
                      loading: {
                        "origins": false,
                        "episodes": false,
                        "servers": false,
                        "player": false
                      }}
        this.selectEpisode = this.selectEpisode.bind(this)
        this.selectOrigin = this.selectOrigin.bind(this)
        this.selectServer = this.selectServer.bind(this)
        this.mediaCache = {}

    }

    componentDidMount() {
        console.log("here")
        let movieId = null;
        if(this.props.location)
            movieId = this.props.location.movieId
        else
            return
        this.setState({"movieId": movieId});
        this.setState({loading : {origins: true, episodes:true}});
        fetch("/api/movie/info?movieId="+movieId)
        .then(r => r.json())
        .then(jsonResp => {
            if(!jsonResp.status)
                return;
            this.setState({movieInfo: jsonResp.response})
        }).catch(e => console.log(e))

        fetch("/api/movie/episodes?movieId="+movieId)
        .then(r => r.json())
        .then(jsonResp => {
            if(!jsonResp.status)
                return;
            let movieInstances = jsonResp.response
            if(Object.keys(movieInstances).length > 0) {
                this.setState({selection: Object.keys(movieInstances).sort()[0], instances: movieInstances, loading : {origins: false, episodes:false}})
                this.selectOrigin(Object.keys(movieInstances).sort()[0]);
            }
        }).catch(e => console.log(e))
    }

    selectOrigin(instanceId) {
        if(!(instanceId in this.state.instances))
            return;

        this.setState({selection: instanceId, movieSrcs: []})
        this.selectEpisode(instanceId, this.state.episodeSelection);
    }

    selectEpisode(instanceId, ep) {
        if(!(instanceId in this.state.instances))
            return;
        this.setState({loading : {servers: true}});
        this.setState({"episodeSelection": parseInt(ep), "selection": instanceId, movieSrcs: []});
        if(this.mediaCache[instanceId] && this.mediaCache[instanceId][ep]) {
            this.setState({loading : {servers: false}});
            this.selectServer(instanceId, ep, Object.keys(this.mediaCache[instanceId][ep])[0])
        } else {
            fetch(`/api/movie/getEpisodeMedia?instanceId=${instanceId}&ep=${ep}`)
            .then(r => r.json())
            .then(jsonResp => {
                if(!jsonResp.status)
                    return;
                let directSources = jsonResp.response.sources.direct;
                let mirrorSources = jsonResp.response.mirrors;
                let iframeSources = jsonResp.response.sources.iframe;
                if(!this.mediaCache[instanceId])
                    this.mediaCache[instanceId] = {}
                if(!this.mediaCache[instanceId][ep])
                    this.mediaCache[instanceId][ep] = {}

                directSources.forEach(sources => {
                    let processed = processSources(sources)
                    console.log(sources)
                    if(processed.length > 0){
                        let serverName = "SV#"+Object.keys(this.mediaCache[instanceId][ep]).length
                        this.mediaCache[instanceId][ep][serverName] = processed
                    }
                });

                Object.keys(mirrorSources).forEach(k => {
                    let processed = processSources(mirrorSources[k]);
                    if(processed.length > 0){
                        let serverName = "Mirror#"+Object.keys(this.mediaCache[instanceId][ep]).length
                        this.mediaCache[instanceId][ep][serverName] = processed
                    }
                });
                iframeSources.forEach(sources => {
                    let processed = sources;
                    if(processed.length > 0){
                        let serverName = "IFRAME#"+Object.keys(this.mediaCache[instanceId][ep]).length
                        this.mediaCache[instanceId][ep][serverName] = processed
                    }
                });
                console.log(this.state);
                this.setState({loading : {episodes: false}});
                this.selectServer(instanceId, ep, Object.keys(this.mediaCache[instanceId][ep])[0]);
                this.setState({loading : {servers: false}});
            })
        }
    }

    selectServer(instanceId, ep, serverName){
        if(serverName in this.mediaCache[instanceId][ep])
            this.setState({serverSelection: serverName, movieSrcs : this.mediaCache[instanceId][ep][serverName]})
    }

    render() {
        let originsNav = []
        let episodesNav = []
        let serversNav = []
        if(Object.keys(this.state.instances).length > 0)
        {
            let origins = Object.keys(this.state.instances).map(k => [this.state.instances[k].origin, k]).sort();
            let selection = this.state.selection ? this.state.selection : Object.keys(this.state.instances).sort()[0];
            let selectionName = this.state.instances[selection].origin;
            originsNav = origins.map(origin => {
                return (<li key={origin[1]} className="nav-item">
                        <button key={origin[1]} className={"nav-link " + (selectionName == origin[0] ? "active" : "")} 
                         onClick={this.selectOrigin.bind(this, origin[1])}>{origin[0]}</button>
                      </li>)
            });
            let episodes = this.state.instances[selection].episodes;
            episodesNav = episodes.map((ep,i) => {
                return (<li key={selection+"_"+i} className="nav-item">
                    <button key={selection+"_"+i} className={"nav-link " + (i == this.state.episodeSelection ? "active" : "")}  
                            onClick={this.selectEpisode.bind(this, selection, i)}>{ep}</button>
                </li>)
            });
            console.log(this.mediaCache[selection])
            if(this.mediaCache[selection] && this.mediaCache[selection][this.state.episodeSelection]) {
                let servers = this.mediaCache[selection][this.state.episodeSelection];
                let serverSelection = this.state.serverSelection ? this.state.serverSelection : Object.keys(this.mediaCache[selection][this.state.episodeSelection])[0];
                serversNav = Object.keys(servers).map(k => {
                    return (<li key={selection+"_"+this.state.episodeSelection+"_"+k} className="nav-item">
                        <button key={selection+"_"+this.state.episodeSelection+"_"+k} className={"nav-link " + (k == serverSelection ? "active" : "")}  
                                onClick={this.selectServer.bind(this, selection, this.state.episodeSelection, k)}>{k}</button>
                    </li>)
                })
            }

        }
        return (
        <div className="container">
            <h3>{this.state.movieInfo.title ? this.state.movieInfo.title : "Loading..."}</h3>
             {this.state.movieSrcs.length > 0 && this.state.movieSrcs[0].type != "iframe" ? <JWMoviePlayer key={this.state.selection+"_"+this.state.episodeSelection+"_"+this.state.serverSelection} movieSrcs={this.state.movieSrcs}/> :
                 <IFramePlayer  key={this.state.selection+"_"+this.state.episodeSelection+"_"+this.state.serverSelection} iframeSrc={this.state.movieSrcs.length ? this.state.movieSrcs[0].src : ""}/> }
                 {this.state.loading.player ? (<img src="./loading.gif"/>) : null}
            <div className="card" style={{"textAlign": "left"}}>
              <div className="card-header">
                <ul className="nav nav-pills card-header-pills">
                  {originsNav}
                  {this.state.loading.origins ? (<img src="./loading.gif"/>) : null}
                </ul>
              </div>
              <div className="card-body">
                <ul className="nav nav-pills">
                  {episodesNav}
                  {this.state.loading.episodes ? (<img src="./loading.gif"/>) : null}
                </ul>
                <div className="card-body">
                    <h6>Servers</h6>
                    <ul className="nav nav-pills">
                      {serversNav}
                      {this.state.loading.servers ? (<img src="./loading.gif"/>) : null}
                    </ul>
              </div>
              </div>

            </div>
        </div>
        );
    }
}