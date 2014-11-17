module.exports   = function (conf) {
    var dgram    = require('dgram'),
        hostname = require('os').hostname(),
        debug    = true,
        statsd   = null,
        syslogd  = null,
        domain   = 'nnm',  // Node Network Monitor (nnm)
        regex    = /^(GET|POST|PUT|DELETE|HEAD|PATCH)\s+([^\s]+)\s+HTTP\/(\d+\.\d+)\r?\n/;

    init(conf);

    function init(config) {
        if (config && config.statsd && config.statsd.host && config.statsd.port) {
            statsd = dgram.createSocket('udp4');
            if (config.statsd.domain) {
                domain = config.statsd.domain;
            }
        }
        if (config && config.syslogd && config.syslogd.host && config.syslogd.port) {
            syslogd = dgram.createSocket('udp4');
        }
    }

    function emit(method, url, version, bytesRead, bytesWritten, elapsed) {
        var statsdBuffer = new Buffer(
                domain + '.http.request.count:'  + 1 +           '|c\n' +
                domain + '.http.request.elapse:' + elapsed +     '|ms\n' +
                domain + '.http.request.size:'   + bytesRead +   '|g\n' +
                domain + '.http.response.size:'  + bytesWritten +'|g'
            );
        if (statsd) {
            if (debug) console.log(statsdBuffer.toString());
            statsd.send(statsdBuffer, 0, statsdBuffer.length, conf.statsd.port, conf.statsd.host, function (err, bytes) {
                if (err)
                    throw err;
            });
        }
        
        var now = new Date();
        var prio = 5;
        var syslogdBuffer = new Buffer(
                '<' + prio + '>' + now.toString() + ' ' + hostname + ' ' + domain + '|' + method + '|' + version + '|' + bytesRead + '|' + bytesWritten  +'|' + elapsed + 'ms' + '|' + url
            );
        if (syslogd) {
            if (debug) console.log(syslogdBuffer.toString());
            syslogd.send(syslogdBuffer, 0, syslogdBuffer.length, conf.syslogd.port, conf.syslogd.host, function (err, bytes) {
                if (err)
                    throw err;
            });
        }
    }

    /**
     *
     */
    function app(server) {
        server.on('request', function (request, response) {
            // console.log('http url: ' + request.url); // '/favicon.ico'
        }).on('connection', function (socket) {
            var url     = null,
                method  = null,
                version = null,
                start   = null,
                bytesRead  = 0;
            socket.on('connect', function () {
                start = new Date();
            }).on('data', function (chunk) {
                bytesRead += chunk.length;
                if (url === null) {
                    // 'GET /favicon.ico HTTP/1.1'
                    var capture = chunk.toString().match(regex);
                    if (capture !== null && capture[0] && capture.length === 4) {
                        method  = capture[1];
                        url     = capture[2];
                        version = capture[3];
                    }
                }
            }).on('end', function () {
                var end     = new Date(),
                    elapsed = end - start;
                emit(method, url, version, bytesRead, socket.bytesWritten, elapsed);
            }).on('close', function () {
            });
        });
    }

    return {
        "app"         : app
    };
};
