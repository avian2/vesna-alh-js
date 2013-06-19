/* Source: https://gist.github.com/Yaffle/1287361 */
function crc32(s) {
	var	polynomial = arguments.length < 2 ? 0x04C11DB7 : arguments[1],
		initialValue = arguments.length < 3 ? 0xFFFFFFFF : arguments[2],
		finalXORValue = arguments.length < 4 ? 0xFFFFFFFF : arguments[3],
		crc = initialValue,
		table = [], i, j, c;

	function reverse(x, n) {
		var b = 0;
		while (n) {
			b = b * 2 + x % 2;
			x /= 2;
			x -= x % 1;
			n--;
		}
		return b;
	}

	for (i = 255; i >= 0; i--) {
		c = reverse(i, 32);

		for (j = 0; j < 8; j++) {
			c = ((c * 2) ^ (((c >>> 31) % 2) * polynomial)) >>> 0;
		}

		table[i] = reverse(c, 32);
	}

	for (i = 0; i < s.byteLength; i++) {
		c = s[i];
		if (c > 255) {
			throw new RangeError();
		}
		j = (crc % 256) ^ c;
		crc = ((crc / 256) ^ table[j]) >>> 0;
	}

	return (crc ^ finalXORValue) >>> 0;
}

function ab2str(ab) {
	return String.fromCharCode.apply(null, new Uint8Array(ab));
}

function ALHWeb(base_url, cluster_id) {
	this.base_url = base_url;

	this.cluster_id = cluster_id;

	this._send = function(url, callback) {
  		var xhr = new XMLHttpRequest();
	
		xhr.open("GET", url, true);
		xhr.responseType = "arraybuffer";
		xhr.onload = function() {
			if(xhr.readyState !== 4) {
				return;
			}

			if(xhr.status === 200) {
				callback(xhr.response);
			}
		};

		xhr.send();
	};

	this.get = function(resource, args, callback) {
		console.log("GET " + resource + "?" + args.join(""));

		var resource_arg = encodeURIComponent(resource + "?" + args.join(""))

		var url = this.base_url + 
				"?method=get" +
				"&resource=" + resource_arg + 
				"&cluster=" + this.cluster_id;

		this._send(url, callback);
	};

	this.post = function(resource, data, args, callback) {
		console.log("POST " + resource + "?" + args.join(""));

		var resource_arg = encodeURIComponent(resource + "?" + args.join(""))

		var url = this.base_url + 
				"?method=post" +
				"&resource=" + resource_arg + 
				"&content=" + encodeURIComponent(data) +
				"&cluster=" + this.cluster_id;

		this._send(url, callback);
	};
};

function ALHProxy(alhproxy, addr) {
	this.alhproxy = alhproxy;

	this.addr = addr;

	this.get = function(resource, args, callback) {
		var nargs = [this.addr + "/" + resource + "?"].concat(args)
		return this.alhproxy.get("nodes", nargs, callback)
	};

	this.post = function(resource, data, args, callback) {
		var nargs = [this.addr + "/" + resource + "?"].concat(args)
		return this.alhproxy.post("nodes", data, nargs, callback)
	};
};

function SweepConfig(config, start_ch, stop_ch, step_ch) {
	this.config = config;
	this.start_ch = start_ch;
	this.stop_ch = stop_ch;
	this.step_ch = step_ch;

	// FIXME - should take step_ch into account
	this.num_channels = stop_ch - start_ch;
}

function SpectrumSensorProgram(sweep_config, time_start, time_duration, slot_id) {
	this.sweep_config = sweep_config;

	this.time_start = time_start;

	this.time_duration = time_duration;

	this.slot_id = slot_id;
};

function SpectrumSensorResult(program) {
	this.program = program;

	this.sweeps = [];
};

function Sweep() {
	this.timestamp = null;
	this.data = [];
};

function SpectrumSensor(alh) {
	this.alh = alh;

	this.retrieve = function(program, callback) {
		var alh = this.alh;
		alh.get("sensing/slotInformation", ["id=" + program.slot_id], function(resp) {
			// assert status=COMPLETE in resp
			
			var g = /size=([0-9]+)/.exec(ab2str(resp))
			var total_size = parseInt(g[1]);

			var p = 0;
			var max_read_size = 512;
			var data = new Uint8Array(total_size);

			function decode() {
				var num_channels = program.sweep_config.num_channels;
				var line_words = num_channels + 2;

				var result = new SpectrumSensorResult(program);

				var values = new Int16Array(data.buffer);
				
				var sweep = new Sweep();
				for(var n = 0; n < values.length; n++) {
					if(n % line_words == 0) {
						sweep.timestamp = 1e-3 * (values[n] + values[n+1] * 0x10000);
					} else if(n % line_words == 1) {
						// ignore
					} else {
						sweep.data.push(values[n] * 1e-2);
					}

					if(sweep.data.length >= num_channels) {
						result.sweeps.push(sweep);
						sweep = new Sweep();
					}
				}

				if(sweep.data) {
					result.sweeps.push(sweep);
				}

				callback(result);
			}

			function get_chunk() {
				if(p >= total_size) {
					decode();
					return;
				}

				var chunk_size = Math.min(max_read_size, total_size - p);

				alh.get("sensing/slotDataBinary", [
					"id=" + program.slot_id +
					"&start=" + p +
					"&size=" + chunk_size],
					function(chunk_data_crc) {

						var chunk_data = chunk_data_crc.slice(0, 
									chunk_data_crc.byteLength - 4);
						var crc = chunk_data_crc.slice(
									chunk_data_crc.byteLength - 4,
									chunk_data_crc.byteLength);

						var byte_array = new Uint8Array(chunk_data);

						var their_crc = new Uint32Array(crc)[0]
						var our_crc = crc32(byte_array);

						console.log(our_crc);
						console.log(their_crc);

						data.set(byte_array, p);

						p += max_read_size;
						get_chunk();
				});
			}

			get_chunk();
		});
	};
};
