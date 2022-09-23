"use strict";

/*
 * Created by Daniel Pfister 2022
 */

/**
 * Load modules
 */
const utils = require("@iobroker/adapter-core");
const urllib = require("urllib");
const moment = require('moment-timezone');
const GeoPoint = require('geopoint'); 


/**
 * The adapter instance
 * @type {ioBroker.Adapter}
 */
let adapter;

var ErrorCounter = 0;
var RefreshTimeout = 5000;

/**
 * Starts the adapter instance
 * @param {Partial<utils.AdapterOptions>} [options]
 */
function startAdapter(options) {
    // Create the adapter and define its methods
    return adapter = utils.adapter(Object.assign({}, options, {
        name: "apple-find-me",
        ready: onReady, // Main method defined below for readability

        // is called when adapter shuts down - callback has to be called under any circumstances!
        unload: (callback) => {
            try {
                clearTimeout(RefreshTimeout);
                callback();
            } catch (e) {
                callback();
            }
        },
        // is called if a subscribed state changes
        stateChange: (id, state) => {
            if (state) {
                if(!state.ack){
                    // The state was changed with no ack
                    const idArray = id.split(".");

                    if(idArray[idArray.length-1] == "PlaySound"){
                        const buildDeviceID = id.replace(idArray[idArray.length-1], "DeviceID");
                        adapter.getState(buildDeviceID, (error, state) => {
                            let DeviceID = state.val;
                            adapter.log.info("PlaySound on device: " + DeviceID);
                            PlaySound(DeviceID);
                            adapter.setState(id, false, true);
                        });
                    }else if(idArray[idArray.length-1] == "Refresh"){  
                        Refresh(false, true);
                    }
                }
            }
        },
    }));
}


/**
 * Function to get Apple-Devices from ICloud
 * 
 */
function RequestData(init) {

    const user = adapter.config.username;
    const pass = adapter.config.password;

    var headers = {
        "Accept-Language": "de-DE",
        "User-Agent": "FindMyiPhone/500 CFNetwork/758.4.3 Darwin/15.5.0",
        "Authorization": "Basic " + Buffer.from(user + ":" + pass).toString('base64'),
        "X-Apple-Realm-Support": "1.0",
        "X-Apple-AuthScheme": "UserIDGuest",
        "X-Apple-Find-API-Ver": "3.0"
    }; 
    var RequestContent = { "clientContext": { "appName" : "iCloud Find (Web)", "appVersion": "7.0", "timezone": adapter.config.timezone }};

    var EndPoint = "initClient";

    if(init === false){
        EndPoint = "refreshClient";
    }

    return new Promise(rtn => {
        urllib.request('https://fmipmobile.icloud.com/fmipservice/device/' + user + '/' + EndPoint, {
            method: 'POST',
            headers: headers,
            rejectUnauthorized: false,
            dataType: 'json',
            content: JSON.stringify(RequestContent)
        }, function(err, data, res) {
            if (!err && res.statusCode == 200) {
                ErrorCounter = 0;
                rtn({ "statusCode": res.statusCode, "response": data })
            } else {
                //Ignore StatusCode -2
                if (res.statusCode == -2) {
                    rtn({ "statusCode": res.statusCode, "response": null })
                } else {
                    ErrorCounter = ErrorCounter + 1;
                    if (ErrorCounter == 5) {
                        adapter.log.error("Error on HTTP-Request. Please check your credentials. StatusCode: " + res.statusCode + " Retry in " + adapter.config.refresh + " minutes. (" + ErrorCounter.toString() + "/3)");
                        adapter.log.error("HTTP request failed for the third time, adapter is deactivated to prevent deactivation of the iCloud account.");
                        adapter.setForeignState("system.adapter." + adapter.namespace + ".alive", false);
                    } else {
                        adapter.log.error("Error on HTTP-Request. Please check your credentials. StatusCode: " + res.statusCode + " Retry in " + adapter.config.refresh + " minutes. (" + ErrorCounter.toString() + "/3)");
                        rtn({ "statusCode": res.statusCode, "response": null })
                    }
                }
            }
        });
    });
}

/**
 * 
 * Function to play sound on Apple-Device (Find my iPhone)
 * 
 */
 function PlaySound(DeviceID) {

    const user = adapter.config.username;
    const pass = adapter.config.password;

    var headers = {
        "Accept-Language": "de-DE",
        "User-Agent": "FindMyiPhone/500 CFNetwork/758.4.3 Darwin/15.5.0",
        "Authorization": "Basic " + Buffer.from(user + ":" + pass).toString('base64'),
        "X-Apple-Realm-Support": "1.0",
        "X-Apple-AuthScheme": "UserIDGuest",
        "X-Apple-Find-API-Ver": "3.0"
    }; 

    var RequestContent = { "clientContext": { "appVersion": "7.0", "fmly": true }, "device": DeviceID, "subject": "IoBroker (Find-Me)" };

    return new Promise(rtn => {
        urllib.request('https://fmipmobile.icloud.com/fmipservice/device/' + user + '/playSound', {
            method: 'POST',
            headers: headers,
            rejectUnauthorized: false,
            dataType: 'json',
            content: JSON.stringify(RequestContent)
        }, function(err, data, res) {
            if (!err && res.statusCode == 200) {
                rtn({ "status": "successfully", "statusCode": 0, "message": "Sound was played successfully" })
            } else {
                //Ignore StatusCode -2
                if (res.statusCode == -2) {
                    rtn({ "statusCode": res.statusCode, "response": null });
                } else if (res.statusCode == 500) {
                    rtn({ "status": "failed", "statusCode": res.statusCode, "message": res.statusMessage });
                } else {
                    rtn({ "status": "failed", "statusCode": res.statusCode, "message": res.statusMessage });
                }
            }
        });
    });
}

/**
 * Function to parse Request-Content and create or update states
 * Input: data (Json-String)
 * 
 */ 
function CreateOrUpdateDevices(data) {

    data.content.forEach(element => {

        //Sleep for 2 Seconds to prevent Rate-Limits
        sleep(2000);

        var DevColor = "";
        if (!element.deviceColor && element.deviceColor != "" && element.deviceColor != undefined) {
            DevColor = "-" + element.deviceColor;
        }

        let DeviceNameWithID = element.name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() + element.id.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
        let DiscoveryID = "";

        if (element.deviceDiscoveryId != undefined && element.deviceDiscoveryId != null && element.deviceDiscoveryId != ""){ 
            DiscoveryID = element.deviceDiscoveryId; 
        }else{
            //Build Dummy DiscoveryID Issue #6
            DiscoveryID = "0E112CBF-D1B1-0001-B12E-" + DeviceNameWithID.substring(0, 12);
        }

        adapter.log.debug("Device: " + element.rawDeviceModel + " Discovery ID: " + DiscoveryID);


        if (DiscoveryID != ""){      
            var deviceImageUrl = 'https://statici.icloud.com/fmipmobile/deviceImages-9.0/' + element.deviceClass + '/' + element.rawDeviceModel + DevColor + '/online-infobox.png';

            adapter.log.debug("Device: " + element.rawDeviceModel + " Discovery ID: " + DiscoveryID + ": Image Url: " + deviceImageUrl);

            
            urllib.request(deviceImageUrl, {
                    method: 'GET',
                    rejectUnauthorized: false,
                },
                async function(err, data, res) {
                    adapter.log.debug("Request Status: " + res.statusCode )
                    if (!err && res.statusCode == 200) {
                        var DeviceImage = "data:image/png;base64," + Buffer.from(data).toString('base64');

                        

                        await adapter.setObjectNotExistsAsync(element.deviceClass, {
                            type: "device",
                            common: {
                                name: 'Apple ' + element.deviceClass + "'s",
                                read: true,
                                write: false,
                                icon: DeviceImage
                            },
                            native: {},
                        });

                        adapter.log.debug("Set class: " + element.deviceClass);

                        await adapter.setObjectNotExistsAsync(element.deviceClass + "." + DiscoveryID, {
                            type: "device",
                            common: {
                                name: element.name,
                                read: true,
                                write: false,
                                icon: DeviceImage
                            },
                            native: {},
                        });

                        await adapter.setObjectNotExistsAsync(element.deviceClass + "." + DiscoveryID + ".ModelType", {
                            type: "state",
                            common: {
                                role: "text",
                                def: "",
                                type: "string",
                                read: true,
                                write: false,
                                name: "ModelType",
                                desc: "Model Typ-Name",
                            },
                            native: {},
                        });
                        adapter.setState(element.deviceClass + "." + DiscoveryID + ".ModelType", element.rawDeviceModel, true);

                        await adapter.setObjectNotExistsAsync(element.deviceClass + "." + DiscoveryID + ".PlaySound", {
                            type: "state",
                            common: {
                                name: "PlaySound",
                                role: "button",
                                type: "boolean",
                                read: true,
                                write: true,
                                desc: "Play Sound on Device",
                                def: false
                            },
                            native: {},
                        });
                        adapter.setState(element.deviceClass + "." + DiscoveryID + ".PlaySound", false, true);
                        adapter.subscribeStates('*.PlaySound');

                        await adapter.setObjectNotExistsAsync(element.deviceClass + "." + DiscoveryID + ".ModelName", {
                            type: "state",
                            common: {
                                role: "text",
                                def: "",
                                type: "string",
                                read: true,
                                write: false,
                                name: "ModelName",
                                desc: "Model Name",
                            },
                            native: {},
                        });
                        adapter.setState(element.deviceClass + "." + DiscoveryID + ".ModelName", element.deviceDisplayName, true);

                        await adapter.setObjectNotExistsAsync(element.deviceClass + "." + DiscoveryID + ".BatteryLevel", {
                            type: "state",
                            common: {
                                name: "BatteryLevel",
                                role: "value.battery",
                                type: "number",
                                min: 0,
                                max: 100,
                                unit: "%",
                                read: true,
                                write: false,
                                desc: "Battery Charging-Level",
                                def: 0
                            },
                            native: {},
                        });
                        adapter.setState(element.deviceClass + "." + DiscoveryID + ".BatteryLevel", parseInt((element.batteryLevel * 100).toString().split('.')[0]), true);
                        adapter.log.debug(element.deviceClass + "." + DiscoveryID + ".BatteryLevel" + " -> " + element.batteryLevel);

                        await adapter.setObjectNotExistsAsync(element.deviceClass + "." + DiscoveryID + ".BatteryState", {
                            type: "state",
                            common: {
                                name: "BatteryState",
                                role: "text",
                                type: "string",
                                read: true,
                                write: false,
                                desc: "Battery State",
                                def: ""
                            },
                            native: {},
                        });
                        adapter.setState(element.deviceClass + "." + DiscoveryID + ".BatteryState", element.batteryStatus, true);
                        adapter.log.debug(element.deviceClass + "." + DiscoveryID + ".BatteryState" + " -> " + element.batteryStatus);

                        await adapter.setObjectNotExistsAsync(element.deviceClass + "." + DiscoveryID + ".ModelImage", {
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
                        adapter.setState(element.deviceClass + "." + DiscoveryID + ".ModelImage", deviceImageUrl, true);

                        await adapter.setObjectNotExistsAsync(element.deviceClass + "." + DiscoveryID + ".DeviceID", {
                            type: "state",
                            common: {
                                name: "DeviceID",
                                role: "text",
                                type: "string",
                                read: true,
                                write: false,
                                desc: "Device Identifiere",
                                def: ""
                            },
                            native: {},
                        });
                        adapter.setState(element.deviceClass + "." + DiscoveryID + ".DeviceID", element.id, true);

                        //Device has location information
                        if (element.hasOwnProperty('location') && element.location != undefined && element.location != null) {

                            adapter.log.debug("Device: " + element.rawDeviceModel + " Discovery ID: " + DiscoveryID + " -> has location information");

                            //Build Channel Location
                            await adapter.setObjectNotExistsAsync(element.deviceClass + "." + DiscoveryID + ".Location", {
                                type: "channel",
                                common: {
                                    name: "Location",
                                },
                                native: {},
                            });
                            //Build Channel Distances
                            await adapter.setObjectNotExistsAsync(element.deviceClass + "." + DiscoveryID + ".Location.Distances", {
                                type: "channel",
                                common: {
                                    name: "Distances",
                                },
                                native: {},
                            });


                            await adapter.setObjectNotExistsAsync(element.deviceClass + "." + DiscoveryID + ".Location.Latitude", {
                                type: "state",
                                common: {
                                    name: "Latitude",
                                    role: "value.gps.latitude",
                                    type: "number",
                                    read: true,
                                    write: false,
                                    desc: "Latitude",
                                    def: 0
                                },
                                native: {},
                            });
                            adapter.setState(element.deviceClass + "." + DiscoveryID + ".Location.Latitude", element.location.latitude, true);

                            await adapter.setObjectNotExistsAsync(element.deviceClass + "." + DiscoveryID + ".Location.Longitude", {
                                type: "state",
                                common: {
                                    name: "Longitude",
                                    role: "value.gps.longitude",
                                    type: "number",
                                    read: true,
                                    write: false,
                                    desc: "Longitude",
                                    def: 0
                                },
                                native: {},
                            });
                            adapter.setState(element.deviceClass + "." + DiscoveryID + ".Location.Longitude", element.location.longitude, true);

                            await adapter.setObjectNotExistsAsync(element.deviceClass + "." + DiscoveryID + ".Location.Position", {
                                type: "state",
                                common: {
                                    name: "Position",
                                    role: "value.gps",
                                    type: "string",
                                    read: true,
                                    write: false,
                                    desc: "Position",
                                    def: "0, 0"
                                },
                                native: {},
                            });
                            adapter.setState(element.deviceClass + "." + DiscoveryID + ".Location.Position", element.location.latitude.toString() + ", " + element.location.longitude.toString(), true);

                            await adapter.setObjectNotExistsAsync(element.deviceClass + "." + DiscoveryID + ".Location.PositionType", {
                                type: "state",
                                common: {
                                    name: "PositionType",
                                    role: "text",
                                    type: "string",
                                    read: true,
                                    write: false,
                                    desc: "PositionTyp",
                                    def: "Unknown"
                                },
                                native: {},
                            });
                            adapter.setState(element.deviceClass + "." + DiscoveryID + ".Location.PositionType", element.location.positionType, true);


                            await adapter.setObjectNotExistsAsync(element.deviceClass + "." + DiscoveryID + ".Location.Altitude", {
                                type: "state",
                                common: {
                                    name: "Altitude",
                                    role: "value.gps.altitude",
                                    type: "number",
                                    unit: "m",
                                    min: 0,
                                    read: true,
                                    write: false,
                                    desc: "Height",
                                    def: 0
                                },
                                native: {},
                            });

                            if(element.location.altitude == 0.0){

                                var UrlArray = 
                                [
                                    {id:1, url:`https://api.opentopodata.org/v1/eudem25m?locations=${element.location.latitude.toString()},${element.location.longitude.toString()}`},
                                    {id:2, url:`https://api.open-elevation.com/api/v1/lookup?locations=${element.location.latitude.toString()},${element.location.longitude.toString()}`}
                                ];

                                var OpenEvaltionAPIUrl = getRandomObject(UrlArray);

                                adapter.log.debug("Using Elevation-Address: " + OpenEvaltionAPIUrl.url);

                                urllib.request(OpenEvaltionAPIUrl.url, {
                                    method: 'GET',
                                    rejectUnauthorized: false,
                                    dataType: 'json'
                                },
                                function(err, data, res) {
                                    if (!err && res.statusCode == 200) {
                                        var AltValue = parseFloat(data.results[0].elevation.toFixed(2));
                                        adapter.setState(element.deviceClass + "." + DiscoveryID + ".Location.Altitude", AltValue, true);
                                    }else{
                                        adapter.setState(element.deviceClass + "." + DiscoveryID + ".Location.Altitude", 0, true);
                                    }
                                });
                            }else {
                                adapter.setState(element.deviceClass + "." + DiscoveryID + ".Location.Altitude", element.location.altitude, true);
                            }
                            
                            await adapter.setObjectNotExistsAsync(element.deviceClass + "." + DiscoveryID + ".Location.Accuracy", {
                                type: "state",
                                common: {
                                    name: "Accuracy",
                                    role: "sensor",
                                    type: "number",
                                    read: true,
                                    write: false,
                                    min: 0,
                                    desc: "Position accuracy",
                                    unit: "m",
                                    def: 0
                                },
                                native: {},
                            });
                            adapter.setState(element.deviceClass + "." + DiscoveryID + ".Location.Accuracy", Math.round(element.location.horizontalAccuracy), true);

                            await adapter.setObjectNotExistsAsync(element.deviceClass + "." + DiscoveryID + ".Location.TimeStamp", {
                                type: "state",
                                common: {
                                    name: "TimeStamp",
                                    role: "text",
                                    type: "string",
                                    read: true,
                                    write: false,
                                    desc: "TimeStamp of last position search",
                                    def: ""
                                },
                                native: {},
                            });
                            var timeStampString = moment(new Date(element.location.timeStamp)).tz(adapter.config.timezone).format(adapter.config.timeformat);
                            adapter.setState(element.deviceClass + "." + DiscoveryID + ".Location.TimeStamp", timeStampString, true);

                            await adapter.setObjectNotExistsAsync(element.deviceClass + "." + DiscoveryID + ".RefreshTimeStamp", {
                                type: "state",
                                common: {
                                    name: "RefreshTimeStamp",
                                    role: "text",
                                    type: "string",
                                    read: true,
                                    write: false,
                                    desc: "TimeStamp of last refresh",
                                    def: ""
                                },
                                native: {},
                            });
                            var refreshTimeStampString = moment(new Date()).tz(adapter.config.timezone).format(adapter.config.timeformat);
                            adapter.setState(element.deviceClass + "." + DiscoveryID + ".RefreshTimeStamp", refreshTimeStampString, true);

                            await adapter.setObjectNotExistsAsync(element.deviceClass + "." + DiscoveryID + ".Location.CurrentAddress", {
                                type: "state",
                                common: {
                                    name: "CurrentAddress",
                                    role: "text",
                                    type: "string",
                                    read: true,
                                    write: false,
                                    desc: "Current address",
                                    def: ""
                                },
                                native: {},
                            });

                            var MapApiUrl = ""
                            if (adapter.config.mapprovider === 'osm') {
                                MapApiUrl = 'https://nominatim.openstreetmap.org/reverse?format=json&accept-language=de-DE&lat=' + element.location.latitude + '&lon=' + element.location.longitude + '&zoom=18&addressdetails=1';
                            } else if (adapter.config.mapprovider === 'bing') {
                                MapApiUrl = 'https://dev.virtualearth.net/REST/v1/Locations/' + element.location.latitude.toFixed(6) + ',' + element.location.longitude.toFixed(6) + '?incl=ciso2&inclnb=1&key=' + adapter.config.apikey;
                            } else if (adapter.config.mapprovider === 'here') {
                                MapApiUrl = 'https://revgeocode.search.hereapi.com/v1/revgeocode?at=' + element.location.latitude.toFixed(6) + ',' + element.location.longitude.toFixed(6) + '&apiKey=' + adapter.config.apikey;
                            } else if (adapter.config.mapprovider === 'google') {
                                MapApiUrl = 'https://maps.googleapis.com/maps/api/geocode/json?latlng=' + element.location.latitude + ',' + element.location.longitude + '&language=de&result_type=street_address&key=' + adapter.config.apikey
                            }else if (adapter.config.mapprovider === 'geoapify') {
                                MapApiUrl = 'https://api.geoapify.com/v1/geocode/reverse?lat=' + element.location.latitude + '&lon=' + element.location.longitude + '&apiKey=' + adapter.config.apikey
                            }else if (adapter.config.mapprovider === 'locationiq_eu') {
                                MapApiUrl = 'https://eu1.locationiq.com/v1/reverse?key='+ adapter.config.apikey +'&lat=' + element.location.latitude + '&lon=' + element.location.longitude + '&format=json'
                            }else if (adapter.config.mapprovider === 'locationiq_usa') {
                                MapApiUrl = 'https://us1.locationiq.com/v1/reverse?key='+ adapter.config.apikey +'&lat=' + element.location.latitude + '&lon=' + element.location.longitude + '&format=json'
                            }else if (adapter.config.mapprovider === 'positionstack') {
                                MapApiUrl = 'http://api.positionstack.com/v1/reverse?access_key=' + adapter.config.apikey +'&query=' + element.location.latitude + ',' + element.location.longitude + '&output=json&limit=1'
                            }else if (adapter.config.mapprovider === 'tomtom') {
                                MapApiUrl = 'https://api.tomtom.com/search/2/reverseGeocode/' + element.location.latitude + '%2C' + element.location.longitude + '?key=' + adapter.config.apikey + '&ext=json'
                            }

                            adapter.log.debug("Using MapApiUrl-Address: " + MapApiUrl);
                

                            urllib.request(MapApiUrl, {
                                    method: 'GET',
                                    rejectUnauthorized: false,
                                    dataType: 'json'
                                },
                                function(err, data, res) {
                                    //if OpenStreetMap
                                    if (adapter.config.mapprovider === 'osm') {
                                        if (!err && res.statusCode == 200) {
                                            var CurrentAddress = "";
                                            if (data.hasOwnProperty('address')) {
                                                var AddressObject = data.address;
                                                if (AddressObject.hasOwnProperty('road')) {
                                                    CurrentAddress += AddressObject.road;
                                                    if (AddressObject.hasOwnProperty('house_number')) {
                                                        CurrentAddress += " " + AddressObject.house_number;
                                                    } 
                                                    CurrentAddress += ", ";
                                                }
                                                if (AddressObject.hasOwnProperty('postcode')) {
                                                    CurrentAddress += AddressObject.postcode + " ";
                                                }
                                                if (AddressObject.hasOwnProperty('village')) {
                                                    CurrentAddress += AddressObject.village;
                                                } else {
                                                    if (AddressObject.hasOwnProperty('town')) {
                                                        CurrentAddress += AddressObject.town;
                                                    }
                                                }
                                            } else {
                                                CurrentAddress = "Response has no Address Object";
                                            }
                                            adapter.setState(element.deviceClass + "." + DiscoveryID + ".Location.CurrentAddress", CurrentAddress, true);
                                        } else {
                                            adapter.log.warn("Error on getting address from OpenStreetMaps");
                                            adapter.setState(element.deviceClass + "." + DiscoveryID + ".Location.CurrentAddress", "< ErrorCode " + res.statusCode + " >", true);
                                        }
                                    } else if (adapter.config.mapprovider === 'bing') {
                                        if (!err && res.statusCode == 200) {
                                            var CurrentAddress = data.resourceSets[0].resources[0].address.formattedAddress;
                                            adapter.setState(element.deviceClass + "." + DiscoveryID + ".Location.CurrentAddress", CurrentAddress, true);
                                        } else {
                                            if (res.statusCode == 401) {
                                                adapter.log.warn("API-Key not valid. Please Validate your API-KEY!");
                                                adapter.setState(element.deviceClass + "." + DiscoveryID + ".Location.CurrentAddress", "< No valid API-KEY >", true);
                                            }
                                        }
                                    } else if (adapter.config.mapprovider === 'here') {
                                        if (!err && res.statusCode == 200) {
                                            try {
                                                var CurrentAddress = data.items[0].address.label;
                                                adapter.setState(element.deviceClass + "." + DiscoveryID + ".Location.CurrentAddress", CurrentAddress, true);
                                            } catch (e) {
                                                adapter.log.warn("Error on getting address from Here-Maps: " + e);
                                                adapter.setState(element.deviceClass + "." + DiscoveryID + ".Location.CurrentAddress", "< Error " + e + " >", true);
                                            }
                                        } else {
                                            adapter.log.warn("Error on getting address from Here-Maps");
                                            adapter.setState(element.deviceClass + "." + DiscoveryID + ".Location.CurrentAddress", "< ErrorCode " + res.statusCode + " >", true);
                                        }
                                    } else if (adapter.config.mapprovider === 'google') {
                                        if (!err && res.statusCode == 200) {
                                            if (data.status == "OK") {
                                                var CurrentAddress = data.results[0].formatted_address;
                                                adapter.setState(element.deviceClass + "." + DiscoveryID + ".Location.CurrentAddress", CurrentAddress, true);
                                            } else {
                                                adapter.log.warn("Error on getting address from Google-Maps (" + data.status + ") - " + data.error_message);
                                                adapter.setState(element.deviceClass + "." + DiscoveryID + ".Location.CurrentAddress", "< Error: " + data.status + " >", true);
                                            }

                                        } else {
                                            adapter.log.warn("Error on getting address from Google-Maps");
                                            adapter.setState(element.deviceClass + "." + DiscoveryID + ".Location.CurrentAddress", "< ErrorCode " + res.statusCode + " >", true);
                                        }
                                    } else if (adapter.config.mapprovider === 'geoapify') {
                                        if (!err && res.statusCode == 200) {
                                            try {
                                                var CurrentAddress = data.features[0].properties.formatted;
                                                adapter.setState(element.deviceClass + "." + DiscoveryID + ".Location.CurrentAddress", CurrentAddress, true);
                                            } catch (e) {
                                                adapter.log.warn("Error on getting address from Geoapify: " + e);
                                                adapter.setState(element.deviceClass + "." + DiscoveryID + ".Location.CurrentAddress", "< Error " + e + " >", true);
                                            }
                                        } else {
                                            adapter.log.warn("Error on getting address from Geoapify");
                                            adapter.setState(element.deviceClass + "." + DiscoveryID + ".Location.CurrentAddress", "< ErrorCode " + res.statusCode + " >", true);
                                        }
                                    } else if (adapter.config.mapprovider === 'locationiq_eu'||adapter.config.mapprovider === 'locationiq_usa') {
                                        if (!err && res.statusCode == 200) {
                                            try {
                                                var CurrentAddress = data.display_name;
                                                adapter.setState(element.deviceClass + "." + DiscoveryID + ".Location.CurrentAddress", CurrentAddress, true);
                                            } catch (e) {
                                                adapter.log.warn("Error on getting address from LocationIQ: " + e);
                                                adapter.setState(element.deviceClass + "." + DiscoveryID + ".Location.CurrentAddress", "< Error " + e + " >", true);
                                            }
                                        } else {
                                            adapter.log.warn("Error on getting address from LocationIQ");
                                            adapter.setState(element.deviceClass + "." + DiscoveryID + ".Location.CurrentAddress", "< ErrorCode " + res.statusCode + " >", true);
                                        }
                                    } else if (adapter.config.mapprovider === 'positionstack') {
                                        if (!err && res.statusCode == 200) {
                                            try {
                                                var CurrentAddress = data.data[0].label;
                                                adapter.setState(element.deviceClass + "." + DiscoveryID + ".Location.CurrentAddress", CurrentAddress, true);
                                            } catch (e) {
                                                adapter.log.warn("Error on getting address from PositionStack: " + e);
                                                adapter.setState(element.deviceClass + "." + DiscoveryID + ".Location.CurrentAddress", "< Error " + e + " >", true);
                                            }
                                        } else {
                                            adapter.log.warn("Error on getting address from PositionStack");
                                            adapter.setState(element.deviceClass + "." + DiscoveryID + ".Location.CurrentAddress", "< ErrorCode " + res.statusCode + " >", true);
                                        }
                                    } else if (adapter.config.mapprovider === 'tomtom') {
                                        if (!err && res.statusCode == 200) {
                                            try {
                                                var CurrentAddress = data.addresses[0].address.freeformAddress;
                                                adapter.setState(element.deviceClass + "." + DiscoveryID + ".Location.CurrentAddress", CurrentAddress, true);
                                            } catch (e) {
                                                adapter.log.warn("Error on getting address from TomTom-API: " + e);
                                                adapter.setState(element.deviceClass + "." + DiscoveryID + ".Location.CurrentAddress", "< Error " + e + " >", true);
                                            }
                                        } else {
                                            adapter.log.warn("Error on getting address from TomTom-API");
                                            adapter.setState(element.deviceClass + "." + DiscoveryID + ".Location.CurrentAddress", "< ErrorCode " + res.statusCode + " >", true);
                                        }
                                    }
                                });


                            await adapter.setObjectNotExistsAsync(element.deviceClass + "." + DiscoveryID + ".Location.CurrentLocation", {
                                type: "state",
                                common: {
                                    name: "CurrentLocation",
                                    role: "location",
                                    type: "string",
                                    read: true,
                                    write: false,
                                    desc: "Current Location",
                                    def: "Unknown"
                                },
                                native: {},
                            });

                                


                            let activeLocationsWithDistance = [];
                            var currentLocation = new GeoPoint(element.location.latitude, element.location.longitude);

                            if (adapter.config.locations) {
                                for (let i = 0; i < adapter.config.locations.length; i++) {
                                    //Check if an location is active
                                    if (adapter.config.locations[i].active) {

                                        await adapter.setObjectNotExistsAsync(element.deviceClass + "." + DiscoveryID + ".Location.Distances." + adapter.config.locations[i].name, {
                                            type: "state",
                                            common: {
                                                name: "Location_" + i ,
                                                role: "text",
                                                type: "number",
                                                read: true,
                                                write: false,
                                                min: 0,
                                                desc: "Distance to the " + i + " defined location",
                                                unit: "m",
                                            },
                                            native: {},
                                        });

                                        adapter.log.debug("Location " + adapter.config.locations[i].name + " is active");
                                        let distanceObj = {
                                            "id":i,
                                            "name": adapter.config.locations[i].name,
                                            "distance": 0
                                        }
                                        var LocationCoordinates = new GeoPoint(parseFloat(adapter.config.locations[i].latitude), parseFloat(adapter.config.locations[i].longitude));
                                        distanceObj.distance = parseInt((currentLocation.distanceTo(LocationCoordinates, true) * 1000).toString().split(".")[0]);
                                        //Add Distance to State
                                        adapter.setState(element.deviceClass + "." + DiscoveryID + ".Location.Distances." + adapter.config.locations[i].name, distanceObj.distance, true);
                                        
                                        activeLocationsWithDistance.push(distanceObj);
                                    }else{
                                        adapter.delObject(element.deviceClass + "." + DiscoveryID + ".Location.Distances." + adapter.config.locations[i].name);
                                    }


                                }
                            }
                            //Retrive smallest distance of locations where set as active
                            if (activeLocationsWithDistance.length > 0) {
                                const smallestDistanceValue = activeLocationsWithDistance.reduce(
                                    (acc, loc) =>
                                    acc.distance < loc.distance ?
                                    acc :
                                    loc
                                )

                                if (smallestDistanceValue.distance < adapter.config.radius) {
                                    adapter.setState(element.deviceClass + "." + DiscoveryID + ".Location.CurrentLocation", smallestDistanceValue.name, true);
                                } else {
                                    adapter.setState(element.deviceClass + "." + DiscoveryID + ".Location.CurrentLocation", "Unknown", true);
                                }
                            } else {
                                adapter.setState(element.deviceClass + "." + DiscoveryID + ".Location.CurrentLocation", "< No Places Defined >", true);
                            }


                        }
                    }
                });
            
        }
   
    });
}



/**
 * OnReady Function
 * it called at Startup the Adapter
 */
function onReady() {
    adapter.getForeignObject("system.config", (err, obj) => {
        main();
    });
}
/**
 * Function to Sleep
 * @param {*} milliseconds 
 * @returns 
 */
function sleep(milliseconds) {
    const date = Date.now();
    let currentDate = null;
    do {
        currentDate = Date.now();
    } while (currentDate - date < milliseconds);
}

/**
 * Get Random Object from an Object Array
 * @param {*} ObjectArray 
 * @returns 
 */
 function getRandomObject(ObjectArray) {

    // get random index value
    const randomIndex = Math.floor(Math.random() * ObjectArray.length);

    // get random object
    const obj = ObjectArray[randomIndex];

    return obj;
}

/**
 * Main Function
 */
async function main() {
    //Clear ErrorCounter
    ErrorCounter = 0;

    adapter.log.info("Starting Adapter Apple-Find-Me");
    if(adapter.config.refresh != "none"){
        adapter.log.info("Refresh every " + adapter.config.refresh + " minutes");
    }else{
        adapter.log.info("Automatic Refresh is disabled");
    }

    await adapter.setObjectNotExistsAsync("LastJsonResponse", {
        type: "state",
        common: {
            role: "text",
            def: "",
            type: "object",
            read: true,
            write: false,
            name: "LastJsonResponse",
            desc: "Last Response from Apple iCloud",
        },
        native: {},
    });

    await adapter.setObjectNotExistsAsync("Connection", {
        type: "state",
        common: {
            name: "Connection",
            role: "indicator.connected",
            type: "boolean",
            read: true,
            write: false,
            desc: "Connection to iCloud",
            def: false

        },
        native: {},
    });

    await adapter.setObjectNotExistsAsync("Account", {
        type: "state",
        common: {
            name: "Account",
            role: "meta",
            type: "string",
            read: true,
            write: false,
            desc: "iCloud Account"
        },
        native: {},
    });

    adapter.setState("Account", adapter.config.username, true);

    await adapter.setObjectNotExistsAsync("Devices", {
        type: "state",
        common: {
            name: "Devices",
            role: "meta",
            type: "number",
            read: true,
            write: false,
            desc: "Number of devices",
            def: 0
        },
        native: {},
    });

    await adapter.setObjectNotExistsAsync("Refresh", {
        type: "state",
        common: {
            name: "Refresh",
            role: "button",
            type: "boolean",
            read: true,
            write: true,
            desc: "Reload data from the iCloud",
            def: false
        },
        native: {},
    });
    adapter.setState("Refresh", false, true);

    adapter.subscribeStates('Refresh');


    var Result = await RequestData(true);
    if (Result.statusCode == 200) {

        adapter.setState("Connection", true, true);
        
        let foundDevs = [];
        Result.response.content.forEach(element => {
            foundDevs.push(element.deviceDisplayName); 
        });
        adapter.log.info(JSON.stringify(Result.response.content.length) + " Device(s) found (" + foundDevs.join(", ") + ")");

        adapter.setState("Devices", Result.response.content.length, true);
        adapter.setState("LastJsonResponse", JSON.stringify(Result.response), true);

        CreateOrUpdateDevices(Result.response);
    }else{
        adapter.setState("Connection", false, true);
    }
   
    Refresh(true, false);
}


/***
 * Refresh function (Reset Data Collector Timer and run Data Collector)
***/
async function Refresh(init, manual){
    try {

        if(init == true){
            if(adapter.config.refresh != "none"){
                adapter.log.debug("Initial Data Collector");
                RefreshTimeout = setTimeout(function() { Refresh(false, false); }, adapter.config.refresh * 60000);
            }
        }else{
            if(manual == true){
                adapter.log.debug("Manual Data Collector");
                var Result = await RequestData(true);
                if (Result.statusCode == 200) {
                    adapter.setState("Connection", true, true);
                    CreateOrUpdateDevices(Result.response);
                }else{
                    adapter.setState("Connection", false, true);
                }
            }else{
                adapter.log.debug("Interval Data Collector");
                var Result = await RequestData(false);
                if (Result.statusCode == 200) {
                    adapter.setState("Connection", true, true);
                    CreateOrUpdateDevices(Result.response);
                }else{
                    adapter.setState("Connection", false, true);
                }
                if(adapter.config.refresh != "none"){
                    RefreshTimeout = setTimeout(function() { Refresh(false, false); }, adapter.config.refresh * 60000);
                }
            }
        } 

    }catch(err){
        adapter.log.error("Error on Refresh: " + err);
        //Reset the Timeout else Adapter gets "stuck"
        if(adapter.config.refresh != "none"){
            RefreshTimeout = setTimeout(function() { Refresh(false, false); }, adapter.config.refresh * 60000);
        }
    }
}

// @ts-ignore parent is a valid property on module
if (module.parent) {
    // Export startAdapter in compact mode
    module.exports = startAdapter;
} else {
    // otherwise start the instance directly
    startAdapter();
}
