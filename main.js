"use strict";

/*
 * Created with @iobroker/create-adapter v1.26.3
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
var urllib = require("urllib");
var schedule = require('node-schedule');
var moment = require('moment-timezone');
var GeoPoint = require('geopoint');

// Load your modules here, e.g.:
// const fs = require("fs");

/**
 * The adapter instance
 * @type {ioBroker.Adapter}
 */
let adapter;

var ErrorCounter = 0;

function decrypt(key, value) {
    let result = "";
    for (let i = 0; i < value.length; ++i) {
        result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
    }
    adapter.log.debug("client_secret decrypt ready");
    return result;
}


/**
 * Starts the adapter instance
 * @param {Partial<utils.AdapterOptions>} [options]
 */
function startAdapter(options) {
    // Create the adapter and define its methods
    return adapter = utils.adapter(Object.assign({}, options, {
        name: "apple-find-me",

        // The ready callback is called when databases are connected and adapter received configuration.
        // start here!
        ready: onReady, // Main method defined below for readability

        // is called when adapter shuts down - callback has to be called under any circumstances!
        unload: (callback) => {
            try {
                // Here you must clear all timeouts or intervals that may still be active
                // clearTimeout(timeout1);
                // clearTimeout(timeout2);
                // ...
                // clearInterval(interval1);

                callback();
            } catch (e) {
                callback();
            }
        },

        // If you need to react to object changes, uncomment the following method.
        // You also need to subscribe to the objects with `adapter.subscribeObjects`, similar to `adapter.subscribeStates`.
        // objectChange: (id, obj) => {
        //     if (obj) {
        //         // The object was changed
        //         adapter.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
        //     } else {
        //         // The object was deleted
        //         adapter.log.info(`object ${id} deleted`);
        //     }
        // },

        // is called if a subscribed state changes
        stateChange: (id, state) => {
            if (state) {
                // The state was changed
                adapter.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
            } else {
                // The state was deleted
                adapter.log.info(`state ${id} deleted`);
            }
        },

        // If you need to accept messages in your adapter, uncomment the following block.
        // /**
        //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
        //  * Using this method requires "common.message" property to be set to true in io-package.json
        //  */
        // message: (obj) => {
        //     if (typeof obj === "object" && obj.message) {
        //         if (obj.command === "send") {
        //             // e.g. send email or pushover or whatever
        //             adapter.log.info("send command");

        //             // Send response in callback if required
        //             if (obj.callback) adapter.sendTo(obj.from, obj.command, "Message received", obj.callback);
        //         }
        //     }
        // },
    }));
}


function RequestData(){
    var headers = {
        "Accept-Language": "de-DE", 
        "User-Agent": "FindMyiPhone/500 CFNetwork/758.4.3 Darwin/15.5.0", 
        "Authorization": "Basic " + Buffer.from(adapter.config.username + ":" + adapter.config.password).toString('base64'), 
        "X-Apple-Realm-Support": "1.0", 
        "X-Apple-AuthScheme": "UserIDGuest", 
        "X-Apple-Find-API-Ver": "3.0"
    };
    //adapter.log.info(JSON.stringify(headers));
    var jsonDataObj = {"clientContext": {"appVersion": "7.0", "fmly": ""  + adapter.config.showfmly + ""} };
 
    return new Promise(rtn => {
        urllib.request('https://fmipmobile.icloud.com/fmipservice/device/' + adapter.config.username + '/initClient', {
            method: 'POST',
            headers: headers,
            rejectUnauthorized: false,
            dataType: 'json',
            content: JSON.stringify(jsonDataObj)
        }, function (err, data, res) {
            if (!err && res.statusCode == 200){
                ErrorCounter = 0;
                rtn({"statusCode": res.statusCode, "response": data})
            }else{
                //Ignore StatusCode -2
                if(res.statusCode == -2){
                    rtn({"statusCode": res.statusCode, "response": null})
                }else{
                    ErrorCounter = ErrorCounter + 1;
                    if( ErrorCounter == 3){
                        adapter.log.error("Error on HTTP-Request. Please check your credentials. StatusCode: " + res.statusCode + " Retry in " + adapter.config.minutes_to_refresh + " minutes. (" + ErrorCounter.toString() + "/3)");
                        adapter.log.error("HTTP request failed for the third time, adapter is deactivated to prevent deactivation of the iCloud account.");
                        adapter.setForeignState("system.adapter." + adapter.namespace + ".alive", false);
                    }else{
                        adapter.log.error("Error on HTTP-Request. Please check your credentials. StatusCode: " + res.statusCode + " Retry in " + adapter.config.minutes_to_refresh + " minutes. (" + ErrorCounter.toString() + "/3)");
                        rtn({"statusCode": res.statusCode, "response": null})
                    }
                }
            }
        });
    });
}

function CreateOrUpdateDevices(data)
{
    data.content.forEach(element => {
        var DevColor = "";
        if(!element.deviceColor && element.deviceColor != "" && element.deviceColor != undefined ){
            DevColor = "-" + element.deviceColor;
        }
        var deviceImageUrl = 'https://statici.icloud.com/fmipmobile/deviceImages-9.0/' + element.deviceClass + '/' + element.rawDeviceModel + DevColor + '/online-infobox.png';
        //adapter.log.info(JSON.stringify(element));
        urllib.request(deviceImageUrl, {
            method: 'GET',
            rejectUnauthorized: false,
        }, 
        function (err, data, res) {
            if (!err && res.statusCode == 200){
                var DeviceImage = "data:image/png;base64," + Buffer.from(data).toString('base64');

                adapter.setObjectNotExists(element.deviceClass, {
                    type: "device",
                    common: {
                        name: 'Apple ' + element.deviceClass + "'s",
                        read: true,
                        write: false,
                        icon: DeviceImage 
                    },
                    native: {},
                });    


                adapter.setObjectNotExists(element.deviceClass + "." + element.deviceDiscoveryId, {
                    type: "device",
                    common: {
                        name: element.name,
                        read: true,
                        write: false,
                        icon: DeviceImage 
                    },
                    native: {},
                });       

                adapter.setObjectNotExists(element.deviceClass + "." + element.deviceDiscoveryId + ".ModelType", {
                    type: "state",
                    common: {
                        role: "text",
                        def: "",
                        type: "string",
                        read: true,
                        write: false,
                        name: "ModelType",
                        desc: "Model Typen-Bezeichnung",
                    },
                    native: {},
                });              
                
                adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".ModelType", element.rawDeviceModel);

                adapter.setObjectNotExists(element.deviceClass + "." + element.deviceDiscoveryId + ".ModelName", {
                    type: "state",
                    common: {
                        role: "text",
                        def: "",
                        type: "string",
                        read: true,
                        write: false,
                        name: "ModelName",
                        desc: "Model Bezeichnung",
                    },
                    native: {},
                });              
                
                adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".ModelName", element.deviceDisplayName);

                adapter.setObjectNotExists(element.deviceClass + "." + element.deviceDiscoveryId + ".BatteryLevel", {
                    type: "state",
                    common: {
                        name: "BatteryLevel",
                        role: "level",
                        type: "number",
                        min: 0,
                        max: 100,
                        unit: "%",
                        read: true,
                        write: false,
                        desc: "Batterie Ladekapazität",
                        def: 0
                    },
                    native: {},
                });       
                adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".BatteryLevel", (element.batteryLevel * 100).toString().split('.')[0]);

                adapter.setObjectNotExists(element.deviceClass + "." + element.deviceDiscoveryId + ".BatteryState", {
                    type: "state",
                    common: {
                        name: "BatteryState",
                        role: "text",
                        type: "string",
                        read: true,
                        write: false,
                        desc: "Batterie Status",
                        def: ""
                    },
                    native: {},
                });       
                adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".BatteryState", element.batteryStatus);

                adapter.setObjectNotExists(element.deviceClass + "." + element.deviceDiscoveryId + ".ModelImage", {
                    type: "state",
                    common: {
                        name: "ModelImage",
                        role: "url",
                        type: "string",
                        read: true,
                        write: false,
                        desc: "Model Symbol",
                        def: ""
                    },
                    native: {},
                });       
                adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".ModelImage", deviceImageUrl);

                adapter.setObjectNotExists(element.deviceClass + "." + element.deviceDiscoveryId + ".DeviceID", {
                    type: "state",
                    common: {
                        name: "DeviceID",
                        role: "text",
                        type: "string",
                        read: true,
                        write: false,
                        desc: "Geräte Identifikationsnummer",
                        def: ""
                    },
                    native: {},
                });       
                adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".DeviceID", element.id);

                //Device has Location Parameters
                if(element.hasOwnProperty('location') && element.location != undefined && element.location != null){
                    
                    adapter.setObjectNotExists(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.Latitude", {
                        type: "state",
                        common: {
                            name: "Latitude",
                            role: "sensor",
                            type: "number",
                            read: true,
                            write: false,
                            desc: "Breitengrad",
                            def: 0
                        },
                        native: {},
                    });       
                    adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.Latitude", element.location.latitude);

                    adapter.setObjectNotExists(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.Longitude", {
                        type: "state",
                        common: {
                            name: "Longitude",
                            role: "sensor",
                            type: "number",
                            read: true,
                            write: false,
                            desc: "Längengrad",
                            def: 0
                        },
                        native: {},
                    });          
                    adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.Longitude", element.location.longitude);
                    
                    adapter.setObjectNotExists(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.Altitude", {
                        type: "state",
                        common: {
                            name: "Altitude",
                            role: "sensor",
                            type: "number",
                            read: true,
                            write: false,
                            desc: "Höhe",
                            def: 0
                        },
                        native: {},
                    });          
                    adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.Altitude", element.location.altitude);   

                    adapter.setObjectNotExists(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.PositionType", {
                        type: "state",
                        common: {
                            name: "PositionType",
                            role: "text",
                            type: "string",
                            read: true,
                            write: false,
                            desc: "PositionTyp",
                            def: ""
                        },
                        native: {},
                    });          
                    adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.PositionType", element.location.positionType);  

                    adapter.setObjectNotExists(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.Accuracy", {
                        type: "state",
                        common: {
                            name: "Accuracy",
                            role: "sensor",
                            type: "number",
                            read: true,
                            write: false,
                            min: 0,
                            desc: "Positionsgenauigkeit",
                            unit: "m",
                            def: 0
                        },
                        native: {},
                    });          
                    adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.Accuracy", Math.round(element.location.horizontalAccuracy));  

                    adapter.setObjectNotExists(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.TimeStamp", {
                        type: "state",
                        common: {
                            name: "TimeStamp",
                            role: "value.time",
                            type: "string",
                            read: true,
                            write: false,
                            desc: "TimeStamp der letzten Positionsermittlung",
                            def: ""
                        },
                        native: {},
                    });          
                    var timeStampString = moment(new Date(element.location.timeStamp)).tz(adapter.config.timezone).format(adapter.config.timeformat);
                    adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.TimeStamp", timeStampString);
                    
                    adapter.setObjectNotExists(element.deviceClass + "." + element.deviceDiscoveryId + ".RefreshTimeStamp", {
                        type: "state",
                        common: {
                            name: "RefreshTimeStamp",
                            role: "value.time",
                            type: "string",
                            read: true,
                            write: false,
                            desc: "TimeStamp der letzten Aktualisierung",
                            def: ""
                        },
                        native: {},
                    });
                    var refreshTimeStampString = moment(new Date()).tz(adapter.config.timezone).format(adapter.config.timeformat);
                    adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".RefreshTimeStamp", refreshTimeStampString);

                    adapter.setObjectNotExists(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.CurrentAddress", {
                        type: "state",
                        common: {
                            name: "CurrentAddress",
                            role: "text",
                            type: "string",
                            read: true,
                            write: false,
                            desc: "Aktuelle Addresse",
                            def: ""
                        },
                        native: {},
                    });          

                    var MapApiUrl = ""
                    if(adapter.config.mapprovider === 'osm'){
                        MapApiUrl = 'https://nominatim.openstreetmap.org/reverse?format=json&accept-language=de-DE&lat=' + element.location.latitude + '&lon=' + element.location.longitude + '&zoom=18&addressdetails=1';
                    }else if (adapter.config.mapprovider === 'bing'){
                        MapApiUrl = 'https://dev.virtualearth.net/REST/v1/Locations/' + element.location.latitude.toFixed(6) + ',' + element.location.longitude.toFixed(6)  + '?incl=ciso2&inclnb=1&key=' + adapter.config.apikey;
                    }else if (adapter.config.mapprovider === 'here'){
                        MapApiUrl = 'https://revgeocode.search.hereapi.com/v1/revgeocode?at=' + element.location.latitude.toFixed(6) + ',' + element.location.longitude.toFixed(6) + '&apiKey=' + adapter.config.apikey;
                    }else if (adapter.config.mapprovider === 'google'){
                        MapApiUrl = 'https://maps.googleapis.com/maps/api/geocode/json?latlng=' + element.location.latitude + ',' + element.location.longitude  + '&language=de&result_type=street_address&key=' + adapter.config.apikey;
                    }
          
                    adapter.log.debug(MapApiUrl);

                    urllib.request(MapApiUrl, {
                        method: 'GET',
                        rejectUnauthorized: false,
                        dataType : 'json'
                    }, 
                    function (err, data, res) {
                        //if OpenStreetMap
                        if(adapter.config.mapprovider === 'osm'){
                            if (!err && res.statusCode == 200){
                                var CurrentAddress = "";
                                if(data.hasOwnProperty('address')){
                                    var AddressObject = data.address;
                                    if(AddressObject.hasOwnProperty('road')){
                                        CurrentAddress += AddressObject.road;
                                        if(AddressObject.hasOwnProperty('house_number')){
                                            CurrentAddress += " " +  AddressObject.house_number; 
                                        }
                                        CurrentAddress += ", ";
                                    }
                                    if(AddressObject.hasOwnProperty('postcode')){
                                        CurrentAddress += AddressObject.postcode + " ";
                                    }
                                    if(AddressObject.hasOwnProperty('village')){
                                        CurrentAddress += AddressObject.village;
                                    }else{
                                        if(AddressObject.hasOwnProperty('town')){
                                            CurrentAddress += AddressObject.town;
                                        }
                                    }
                                }else{
                                    CurrentAddress = "Response has no Address Object";
                                }
                                adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.CurrentAddress", CurrentAddress);
                            }
                            else {
                                adapter.log.error("Error on getting address from OpenStreetMaps");
                                adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.CurrentAddress", "< ErrorCode " + res.statusCode + " >");
                            }
                        }else if(adapter.config.mapprovider === 'bing'){
                            if (!err && res.statusCode == 200){
                                var CurrentAddress = data.resourceSets[0].resources[0].address.formattedAddress;
                                adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.CurrentAddress", CurrentAddress);
                            }else{
                                if(res.statusCode == 401){
                                    adapter.log.error("API-Key not valid. Please Validate your API-KEY!");
                                    adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.CurrentAddress", "< No valid API-KEY >");
                                }
                            }
                        }else if(adapter.config.mapprovider === 'here'){
                            if (!err && res.statusCode == 200){
                                try{
                                    var CurrentAddress = data.items[0].address.label;
                                    adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.CurrentAddress", CurrentAddress);
                                }catch(e){
                                    adapter.log.error("Error on getting address from Here-Maps: " + e);
                                    adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.CurrentAddress", "< Error " + e + " >");
                                }    
                            }else {
                                adapter.log.error("Error on getting address from Here-Maps");
                                adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.CurrentAddress", "< ErrorCode " + res.statusCode + " >");
                            }
                        }else if(adapter.config.mapprovider === 'google'){
                            if (!err && res.statusCode == 200) {
                                if (data.status == "OK") {
                                    var CurrentAddress = data.results[0].formatted_address;
                                    adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.CurrentAddress", CurrentAddress);
                                } else {
                                    adapter.log.error("Error on getting address from Google-Maps");
                                    adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.CurrentAddress", "< Error: " + data.status+ " >");
                                }

                            }else {
                                adapter.log.error("Error on getting address from Google-Maps");
                                adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.CurrentAddress", "< ErrorCode " + res.statusCode + " >");
                            }
                        }
                    });
                    

                    adapter.setObjectNotExists(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.CurrentLocation", {
                        type: "state",
                        common: {
                            name: "CurrentLocation",
                            role: "location",
                            type: "string",
                            read: true,
                            write: false,
                            desc: "Aktueller Standort",
                            def: "Unknown"
                        },
                        native: {},
                    });    


                    let activeLocationsWithDistance = [];
                    var currentLocation = new GeoPoint(element.location.latitude, element.location.longitude);
                   
                    if(adapter.config.locations){
                        for (let i = 0; i < adapter.config.locations.length; i++) {
                            //Check if an Loocation is active
                            if (adapter.config.locations[i].active) {
                                adapter.log.debug("Location " + adapter.config.locations[i].name + " is aktive");
                                let distanceObj = {
                                    "name": adapter.config.locations[i].name,
                                    "distance": 0
                                }
                                var LocationCoordinates = new GeoPoint(parseFloat(adapter.config.locations[i].latitude), parseFloat(adapter.config.locations[i].longitude));
                                distanceObj.distance = parseInt((currentLocation.distanceTo(LocationCoordinates, true) * 1000).toString().split(".")[0]);
                                activeLocationsWithDistance.push(distanceObj);
                            }
                            
                           
                        }
                    }
                    //Retrive smallest distance of locations where set as active
                    if (activeLocationsWithDistance.length > 0){
                        const smallestDistanceValue = activeLocationsWithDistance.reduce(
                        (acc, loc) =>
                            acc.distance < loc.distance
                            ? acc
                            : loc
                        )
                        if(smallestDistanceValue.distance < 150){
                            adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.CurrentLocation", smallestDistanceValue.name);
                        }else{
                            adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.CurrentLocation", "Unknown");
                        }
                    }else{
                        adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.CurrentLocation", "< No Places Defined >");
                    }
                }
            }
        });
    });
}



/**
 * OnReady Function
 * it called at Startup the Adapter
 */
function onReady() {
    adapter.getForeignObject("system.config", (err, obj) => {
        try {
            if (obj && obj.native && obj.native.secret) {
                //noinspection JSUnresolvedVariable
                adapter.config.password = decrypt(obj.native.secret, adapter.config.password || "kein Secret vorhanden" );
            } else {
                //noinspection JSUnresolvedVariable
                adapter.config.password = decrypt("Zgfr56gFe87jJOM", adapter.config.password || "kein Secret vorhanden");
            }
                
        } catch (err) {
            adapter.log.warn("Error: " + err);
        }
        main();
    });
}

/**
 * Main Function
 */
async function main() {
    //Clear ErrorCounter
    ErrorCounter = 0;

    adapter.log.info("Starting Adapter Apple-Find-Me");
    adapter.log.info("Refresh every " + adapter.config.refresh + " minutes");

    var Result = await RequestData();
    if(Result.statusCode == 200){
        adapter.log.info(JSON.stringify(Result.response.content.length) + " Devices found");
        CreateOrUpdateDevices(Result.response);
    }

    var j = schedule.scheduleJob('*/' + adapter.config.refresh + ' * * * *', async function(){
        var Result = await RequestData();
        if(Result.statusCode == 200){
            CreateOrUpdateDevices(Result.response);
        }
    });
}

// @ts-ignore parent is a valid property on module
if (module.parent) {
    // Export startAdapter in compact mode
    module.exports = startAdapter;
} else {
    // otherwise start the instance directly
    startAdapter();
}