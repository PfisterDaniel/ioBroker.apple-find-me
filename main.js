"use strict";

/*
 * Created by Daniel Pfister 2021
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
var urllib = require("urllib");
var schedule = require('node-schedule');
var moment = require('moment-timezone');
var GeoPoint = require('geopoint');

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
                // Here you must clear all timeouts or intervals that may still be active
                // clearTimeout(timeout1);
                // clearInterval(interval1);

                clearTimeout(RefreshTimeout);
                callback();
            } catch (e) {
                callback();
            }
        },
    }));
}

/**
 * Function to get Apple-Devices from ICloud
 * 
 */
function RequestData() {

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
    //adapter.log.info(JSON.stringify(headers));
    //var jsonDataObj = {"clientContext": {"appVersion": "7.0", "fmly": ""  + adapter.config.showfmly + ""} };

    return new Promise(rtn => {
        urllib.request('https://fmipmobile.icloud.com/fmipservice/device/' + user + '/initClient', {
            method: 'POST',
            headers: headers,
            rejectUnauthorized: false,
            dataType: 'json',
            //content: JSON.stringify(jsonDataObj)
            content: ''
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
 * Function to parse Request-Content and create or update states
 * Input: data (Json-String)
 * 
 */ 
function CreateOrUpdateDevices(data) {
    data.content.forEach(element => {
        var DevColor = "";
        if (!element.deviceColor && element.deviceColor != "" && element.deviceColor != undefined) {
            DevColor = "-" + element.deviceColor;
        }
        
        if (element.deviceDiscoveryId != undefined && element.deviceDiscoveryId != null && element.deviceDiscoveryId != ""){
       
            var deviceImageUrl = 'https://statici.icloud.com/fmipmobile/deviceImages-9.0/' + element.deviceClass + '/' + element.rawDeviceModel + DevColor + '/online-infobox.png';
            //adapter.log.info(JSON.stringify(element));
            urllib.request(deviceImageUrl, {
                    method: 'GET',
                    rejectUnauthorized: false,
                },
                async function(err, data, res) {
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


                        await adapter.setObjectNotExistsAsync(element.deviceClass + "." + element.deviceDiscoveryId, {
                            type: "device",
                            common: {
                                name: element.name,
                                read: true,
                                write: false,
                                icon: DeviceImage
                            },
                            native: {},
                        });

                        await adapter.setObjectNotExistsAsync(element.deviceClass + "." + element.deviceDiscoveryId + ".ModelType", {
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

                        adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".ModelType", element.rawDeviceModel, true);

                        await adapter.setObjectNotExistsAsync(element.deviceClass + "." + element.deviceDiscoveryId + ".ModelName", {
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

                        adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".ModelName", element.deviceDisplayName, true);

                        await adapter.setObjectNotExistsAsync(element.deviceClass + "." + element.deviceDiscoveryId + ".BatteryLevel", {
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
                        adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".BatteryLevel", parseInt((element.batteryLevel * 100).toString().split('.')[0]), true);

                        await adapter.setObjectNotExistsAsync(element.deviceClass + "." + element.deviceDiscoveryId + ".BatteryState", {
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
                        adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".BatteryState", element.batteryStatus, true);

                        await adapter.setObjectNotExistsAsync(element.deviceClass + "." + element.deviceDiscoveryId + ".ModelImage", {
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
                        adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".ModelImage", deviceImageUrl, true);

                        await adapter.setObjectNotExistsAsync(element.deviceClass + "." + element.deviceDiscoveryId + ".DeviceID", {
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
                        adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".DeviceID", element.id, true);

                        //Device has Location Parameters
                        if (element.hasOwnProperty('location') && element.location != undefined && element.location != null) {

                            await adapter.setObjectNotExistsAsync(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.Latitude", {
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
                            adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.Latitude", element.location.latitude, true);

                            await adapter.setObjectNotExistsAsync(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.Longitude", {
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
                            adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.Longitude", element.location.longitude, true);

                            await adapter.setObjectNotExistsAsync(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.Position", {
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
                            adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.Position", element.location.latitude.toString() + ", " + element.location.longitude.toString(), true);

                            await adapter.setObjectNotExistsAsync(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.Altitude", {
                                type: "state",
                                common: {
                                    name: "Altitude",
                                    role: "value.gps.altitude",
                                    type: "number",
                                    read: true,
                                    write: false,
                                    desc: "Height",
                                    def: 0
                                },
                                native: {},
                            });
                            adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.Altitude", element.location.altitude, true);

                            await adapter.setObjectNotExistsAsync(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.PositionType", {
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
                            adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.PositionType", element.location.positionType, true);

                            await adapter.setObjectNotExistsAsync(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.Accuracy", {
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
                            adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.Accuracy", Math.round(element.location.horizontalAccuracy), true);

                            await adapter.setObjectNotExistsAsync(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.TimeStamp", {
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
                            adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.TimeStamp", timeStampString, true);

                            await adapter.setObjectNotExistsAsync(element.deviceClass + "." + element.deviceDiscoveryId + ".RefreshTimeStamp", {
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
                            adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".RefreshTimeStamp", refreshTimeStampString, true);

                            await adapter.setObjectNotExistsAsync(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.CurrentAddress", {
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
                                MapApiUrl = 'https://maps.googleapis.com/maps/api/geocode/json?latlng=' + element.location.latitude + ',' + element.location.longitude + '&language=de&result_type=street_address&key=' + adapter.config.apikey;
                            }

                            adapter.log.debug(MapApiUrl);

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
                                            adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.CurrentAddress", CurrentAddress, true);
                                        } else {
                                            adapter.log.error("Error on getting address from OpenStreetMaps");
                                            adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.CurrentAddress", "< ErrorCode " + res.statusCode + " >", true);
                                        }
                                    } else if (adapter.config.mapprovider === 'bing') {
                                        if (!err && res.statusCode == 200) {
                                            var CurrentAddress = data.resourceSets[0].resources[0].address.formattedAddress;
                                            adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.CurrentAddress", CurrentAddress, true);
                                        } else {
                                            if (res.statusCode == 401) {
                                                adapter.log.error("API-Key not valid. Please Validate your API-KEY!");
                                                adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.CurrentAddress", "< No valid API-KEY >", true);
                                            }
                                        }
                                    } else if (adapter.config.mapprovider === 'here') {
                                        if (!err && res.statusCode == 200) {
                                            try {
                                                var CurrentAddress = data.items[0].address.label;
                                                adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.CurrentAddress", CurrentAddress, true);
                                            } catch (e) {
                                                adapter.log.error("Error on getting address from Here-Maps: " + e);
                                                adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.CurrentAddress", "< Error " + e + " >", true);
                                            }
                                        } else {
                                            adapter.log.error("Error on getting address from Here-Maps");
                                            adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.CurrentAddress", "< ErrorCode " + res.statusCode + " >", true);
                                        }
                                    } else if (adapter.config.mapprovider === 'google') {
                                        if (!err && res.statusCode == 200) {
                                            if (data.status == "OK") {
                                                var CurrentAddress = data.results[0].formatted_address;
                                                adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.CurrentAddress", CurrentAddress, true);
                                            } else {
                                                adapter.log.error("Error on getting address from Google-Maps");
                                                adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.CurrentAddress", "< Error: " + data.status + " >", true);
                                            }

                                        } else {
                                            adapter.log.error("Error on getting address from Google-Maps");
                                            adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.CurrentAddress", "< ErrorCode " + res.statusCode + " >", true);
                                        }
                                    }
                                });


                            await adapter.setObjectNotExistsAsync(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.CurrentLocation", {
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
                                    //Check if an Loocation is active
                                    if (adapter.config.locations[i].active) {
                                        adapter.log.debug("Location " + adapter.config.locations[i].name + " is active");
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
                            if (activeLocationsWithDistance.length > 0) {
                                const smallestDistanceValue = activeLocationsWithDistance.reduce(
                                    (acc, loc) =>
                                    acc.distance < loc.distance ?
                                    acc :
                                    loc
                                )
                                if (smallestDistanceValue.distance < 150) {
                                    adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.CurrentLocation", smallestDistanceValue.name, true);
                                } else {
                                    adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.CurrentLocation", "Unknown", true);
                                }
                            } else {
                                adapter.setState(element.deviceClass + "." + element.deviceDiscoveryId + ".Location.CurrentLocation", "< No Places Defined >", true);
                            }
                        }
                    }
                });
        }else{
            
            adapter.log.warn("DeviceDiscoveryId was empty from element: " + JSON.stringify(element));
        }
    });
}



/**
 * OnReady Function
 * it called at Startup the Adapter
 */
function onReady() {
    adapter.getForeignObject("system.config", (err, obj) => {
        /*try {
            if (obj && obj.native && obj.native.secret) {
                //noinspection JSUnresolvedVariable
                adapter.config.password = decrypt(obj.native.secret, adapter.config.password || "No secret exists");
            } else {
                //noinspection JSUnresolvedVariable
                adapter.config.password = decrypt("Zgfr56gFe87jJOM", adapter.config.password || "No secret exists");
            }

        } catch (err) {
            adapter.log.warn("Error: " + err);
        }*/
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
    if (Result.statusCode == 200) {
        adapter.log.info(JSON.stringify(Result.response.content.length) + " Devices found");
        CreateOrUpdateDevices(Result.response);
    }

    //var j = schedule.scheduleJob('*/' + adapter.config.refresh + ' * * * *', async function() {
    //    var Result = await RequestData();
    //    if (Result.statusCode == 200) {
    //        CreateOrUpdateDevices(Result.response);
    //    }
    //});    
    Refresh();
}

async function Refresh(){
    try {
        adapter.log.info("Refresh Apple-Find-Me Instance: " + adapter.config.username);
        var Result = await RequestData();
        if (Result.statusCode == 200) {
            CreateOrUpdateDevices(Result.response);
        }
        RefreshTimeout = setTimeout(Refresh, adapter.config.refresh * 60000);
    }catch(err){
        adapter.log.error(err);
        //Reset the Timeout else Adapter gets "stuck"
        RefreshTimeout = setTimeout(Refresh, adapter.config.refresh * 60000);
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
