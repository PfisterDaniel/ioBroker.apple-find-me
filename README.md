![Logo](https://raw.githubusercontent.com/PfisterDaniel/iobroker.apple-find-me/master/admin/find-me.png)
# iobroker.apple-find-me

[![NPM version](http://img.shields.io/npm/v/iobroker.apple-find-me.svg)](https://www.npmjs.com/package/iobroker.apple-find-me)
[![Downloads](https://img.shields.io/npm/dm/iobroker.apple-find-me.svg)](https://www.npmjs.com/package/iobroker.apple-find-me)

[![NPM](https://nodei.co/npm/iobroker.apple-find-me.png?downloads=true)](https://nodei.co/npm/iobroker.apple-find-me/)

## Apple-find-me Adapter for ioBroker

Apple Find Me Connector is a ioBroker-Adapter to get the current locations and other metrics of connected Apple devices.

It work's without 2-Factor-Authentication (2FA) and retrive all connected devices.

## Configuration
![ConfigImage](https://raw.githubusercontent.com/PfisterDaniel/iobroker.apple-find-me/master/images/config.png)

### Available Timezones
Used Library [MomentJs](https://momentjs.com/timezone)

### Pages for API-KEY's:
* [HereMaps](https://developer.here.com/)
* [BingMaps](https://www.bingmapsportal.com/)
* [GoogleMaps](https://developers.google.com/maps/documentation/javascript/get-api-key)


## Example Objects
![Example](https://raw.githubusercontent.com/PfisterDaniel/iobroker.apple-find-me/master/images/example_output.png)



## Changelog

### 0.0.6
* Bugfix #2
* Add Position State

### 0.0.5
* Add Trier
* Change Error-Count intervall

### 0.0.4
* Bugfix with Time-Format in the Objectlist (Set default rule from value.time to text)
* Family-Devices not longer working

### 0.0.3
* Add Timezone and Time-Formats
* Bugfixes

### 0.0.2
* Added features and bugfixes

### 0.0.1
* Initial release


## Bugs and feature requests
Please create an issue in [GitHub](https://github.com/PfisterDaniel/iobroker.apple-find-me/issues)


## License

MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


Copyright (c) 2022 MasterDan kontakt@daniel-lippert.de
