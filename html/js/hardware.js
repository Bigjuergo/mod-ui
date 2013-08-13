/*
 * Copyright 2012-2013 AGR Audio, Industria e Comercio LTDA. <contato@portalmod.com>
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

function HardwareManager(options) {
    var self = this

    options = $.extend({
	// This is the function that will actually make the addressing
	address: function(instanceId, symbol, addressing, callback) { callback(true) },

	// Callback to get the GUI object of a plugin instance
	getGui: function(instanceId) { }

	// Callback to enable or disable a control in GUI
	
    }, options)

    // All units that can be addressed as tap tempo
    var taptempoUnits = [ 'bpm', 'hz', 'ms', 's' ]
    // All control types
    var controlTypes = [ 'switch', 'range', 'tap_tempo' ]
    
    this.reset = function() {
	/* All adressings indexed by actuator
	   key: "hardwareType,hardwareId,actuatorType,actuatorId"
	   value: ["instanceId,symbol"]
	*/
	self.addressings = {}

	/* All addressings indexed by instanceId and control port
	   key: [instanceId][symbol]
	   value: complete addressing structure
	*/
	self.controls = {}

	// Initializes addressings
	self.listActuators()
    }
    
    // Lists all available actuators and initializes the addressing structure
    this.listActuators = function() {
	var actuators = []
	var i, j, type, actuator, actuatorKey
	for (i=0; i<controlTypes.length; i++) {
	    type = controlTypes[i]
	    for (j=0; j<HARDWARE_PROFILE[type].length; j++) {
		actuatorData = HARDWARE_PROFILE[type][j]
		actuator = {}
		actuator.address = actuatorData.slice(0, 4)
		actuator.type = type
		actuator.exclusive = actuatorData[4]
		actuator.label = actuatorData[5]
		actuators.push(actuator)

		actuatorKey = actuator.address.join(',')
		if (!self.addressings[actuatorKey])
		    self.addressings[actuatorKey] = []
	    }
	}
	return actuators
    }

    this.reset()

    // Get all addressing types that can be used for a port
    this.availableAddressingTypes = function(port) {
	var types = []
	if (port.toggled)
	    types.push('switch')
	else {
	    types.push('range')
	    if (port.unit && port.unit.symbol && taptempoUnits.indexOf(port.unit.symbol) >= 0)
		types.push('tap_tempo')
	}
	return types
    }

    // Checks if an actuator is available for a port
    this.available = function(actuator, instanceId, port) {
	var actuatorKey = actuator.address.join(',')
	var portKey = [instanceId, port.symbol].join(',')
	return (!actuator.exclusive
		|| self.addressings[actuatorKey].length == 0
		|| self.addressings[actuatorKey].indexOf(portKey) >= 0)
    }

    // Gets a list of available actuators for a port
    this.availableActuators = function(instanceId, port) {
	var portKey = [instanceId, port.symbol].join(',')
	var types = self.availableAddressingTypes(port)
	var actuators = self.listActuators(instanceId, port)

	var available = []
	for (var i=0; i<actuators.length; i++) {
	    if (types.indexOf(actuators[i].type) < 0)
		continue
	    if (!self.available(actuators[i], instanceId, port))
		continue
	    available.push(actuators[i])
	}
	return available
    }

    // Opens an addressing window to address this a port
    this.open = function(instanceId, port, currentValue) {
	var currentAddressing = {}
	if (self.controls[instanceId])
	    currentAddressing = self.controls[instanceId][port.symbol] || {}

	// Renders the window
	var form = $(options.renderForm(instanceId, port))

	var actuators = self.availableActuators(instanceId, port)
	var select = form.find('select[name=actuator]')
	$('<option value="-1">').text('Select').appendTo(select)
	var i, value, actuator, opt
	for (i=0; i<actuators.length; i++) {
	    opt = $('<option>').attr('value', i).text(actuators[i].label).appendTo(select)
	    if (currentAddressing.actuator
		&& currentAddressing.actuator.join(',') == actuators[i].address.join(','))
	    {
		select.val(i)
	    }
	}
	console.log(options.getGui(instanceId))
	var gui = options.getGui(instanceId)
	var pluginName = gui.effect.label || gui.effect.name
	var portName = pluginName
	if (port.symbol != ':bypass') portName += ' - ' + port.name

	var min = form.find('input[name=min]').val(currentAddressing.minimum || port.minimum)
	var max = form.find('input[name=max]').val(currentAddressing.maximum || port.maximum)
	var label = form.find('input[name=label]').val(currentAddressing.label || portName)
	form.find('.js-save').click(function() {
	    actuator = {}
	    if (select.val() >= 0)
		actuator = actuators[select.val()]

	    // Here the addressing structure is created
	    var addressing = { actuator: actuator.address,
			       addressing_type: actuator.type,
			       label: label.val() || port.name,
			       minimum: min.val() || port.minimum,
			       maximum: max.val() || port.maximum,
			       value: currentValue
			     }

	    self.setAddressing(instanceId, port.symbol, addressing,
			       function() {
				   form.window('close')
			       })
	})
	form.find('.js-close').click(function() {
	    form.remove()
	})
	form.appendTo($('body'))
    }
    
    /* Based on port data and addressingType chosen, creates the addressing data
     * structure that is expected by the server
     * TODO
     * This is very confusing. This method calculates firmware protocol parameters based on
     * user chosen values. These parameters shouldn't be part of the serialized data. The proper
     * place for this is the webserver, that should calculate this on demand.
     */
    this.setIHMParameters = function(instanceId, symbol, addressing) {
	addressing.type = 0
	addressing.type_options = 0
	addressing.options = []
	// TODO addressing.unit
	if (!addressing.actuator)
	    return
	var port = options.getGui(instanceId).controls[symbol]
	if (port.logarithmic)
	    addressing.type = 1
	else if (port.enumeration) {
	    addressing.type = 2
	    addressing.options = port.scalePoints.map(function(point) { 
		return [ point.value, point.label ]
	    })
	} else if (port.trigger)
	    addressing.type = 4
	else if (port.toggled)
	    addressing.type = 3
	/*
	else if (addressingType == 'tap_tempo') {
	    // TODO
	    // Looks like this tap tempo addressing structure is obsolete, so
	    // is the field type_options
	    addressing.type = 5
	    addressing.type_options = taptempoUnits.indexOf(self.data('unit').symbol) + 1
	}
	*/
    }

    // Does the addressing
    this.setAddressing = function(instanceId, symbol, addressing, callback) {
	self.setIHMParameters(instanceId, symbol, addressing)

	options.address(instanceId, symbol, addressing, function(ok, result) {
	    var actuator = addressing.actuator || [-1, -1, -1, -1]
	    var actuatorKey = actuator.join(',')
	    var portKey = [ instanceId, symbol ].join(',')
	    if (ok) {
		var gui = options.getGui(instanceId)
		if (actuator[0] >= 0) {
		    // We're addressing
		    self.addressings[actuatorKey].push(portKey)
		    self.controls[instanceId] = self.controls[instanceId] || {}
		    self.controls[instanceId][symbol] = addressing
		    gui.disable(symbol)
		} else {
		    // We're unaddressing
		    if (!self.controls[instanceId] || !self.controls[instanceId][symbol])
			// not addressed, nothing to be done
			return callback(true)
		    var currentAddressing = self.controls[instanceId][symbol]
		    actuatorKey = currentAddressing.actuator.join(',')
		    var portIndex = self.addressings[actuatorKey].indexOf(portKey)
		    self.addressings[actuatorKey].splice(portIndex, 1)
		    delete self.controls[instanceId][symbol]
		    gui.enable(symbol)
		    
		    // Set the returned value in GUI
		    gui.setPortValue(symbol, result.value)
		}
	    }
	    callback(ok)
	})
    }

    this.serializeInstance = function(instanceId) {
	return self.controls[instanceId]
    }

    this.unserializeInstance = function(instanceId, addressings, bypassApplication) {
	// Store the original options.change callback, to bypass application
	var callback = options.address
	if (bypassApplication)
	    options.address = function() { arguments[arguments.length-1](true) }
	var restore = function() {
	    options.address = callback
	}

	// Make a queue of symbols to be addressed and process the queue with
	// a recursive asynchronous function
	var queue = Object.keys(addressings)
	var symbol
	var processNext = function() {
	    if (queue.length == 0)
		return restore()
	    symbol = queue.pop()
	    self.setAddressing(instanceId, symbol, addressings[symbol], processNext)
	}

	processNext()
    }

    // Removes an instance
    this.removeInstance = function(instanceId) {
	var actuator, symbol, actuatorKey, ports, i
	for (symbol in self.controls[instanceId]) {
	    actuator = self.controls[instanceId][symbol].actuator
	    actuatorKey = actuator.join(',')
	    ports = self.addressings[actuatorKey]
	    for (i=0; i<ports.length; i++) {
		if (parseInt(ports[i].split(/,/)[0]) == instanceId) {
		    ports.splice(i, 1)
		    i--
		}
	    }
	}
	delete self.controls[instanceId]
    }

}