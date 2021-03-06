// Copyright (c) 2015 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

'use strict';

var CountedReadySignal = require('ready-signal/counted');
var extend = require('xtend');
var http = require('http');
var parallel = require('run-parallel');
var PassThrough = require('stream').PassThrough;
var test = require('tape');
var StringDecoder = require('string_decoder').StringDecoder;

var TChannelHTTP = require('../as/http.js');
var allocCluster = require('./lib/alloc-cluster.js');
var LBPool = require('lb_pool').Pool;
var validators = require('./lib/simple_validators');

function isNumber(assert, value) {
    assert.ok(typeof value === 'number', 'expected number');
}

var fixture = {
    'tchannel.http-handler.egress.request-build-latency': {
        'name': 'tchannel.http-handler.egress.request-build-latency',
        'type': 'timing',
        'value': isNumber,
        'tags': {
            'app': '',
            'host': '',
            'cluster': '',
            'version': '',
            'callerName': 'wat',
            'targetService': 'test_http'
        }
    },
    'tchannel.http-handler.egress.response-build-latency': {
        'name': 'tchannel.http-handler.egress.response-build-latency',
        'type': 'timing',
        'value': isNumber,
        'tags': {
            'app': '',
            'host': '',
            'cluster': '',
            'version': '',
            'callerName': 'wat',
            'targetService': 'test_http'
        }
    },
    'tchannel.http-handler.ingress.request-build-latency': {
        'name': 'tchannel.http-handler.ingress.request-build-latency',
        'type': 'timing',
        'value': isNumber,
        'tags': {
            'app': '',
            'host': '',
            'cluster': '',
            'version': '',
            'callerName': 'wat',
            'targetService': 'test_http'
        }
    },
    'tchannel.http-handler.ingress.response-build-latency': {
        'name': 'tchannel.http-handler.ingress.response-build-latency',
        'type': 'timing',
        'value': isNumber,
        'tags': {
            'app': '',
            'host': '',
            'cluster': '',
            'version': '',
            'callerName': 'wat',
            'targetService': 'test_http'
        }
    },
    'tchannel.http-handler.ingress.service-call-latency': {
        'name': 'tchannel.http-handler.ingress.service-call-latency',
        'type': 'timing',
        'value': isNumber,
        'tags': {
            'app': '',
            'host': '',
            'cluster': '',
            'version': '',
            'callerName': 'wat',
            'targetService': 'test_http'
        }
    },
};

allocHTTPTest('as/http can bridge a service using node http (streaming)', {
    onServiceRequest: handleTestHTTPRequest,
    verifyStats: true
}, function t(cluster, assert) {

    var egressHost = cluster.httpEgress.address().address + ':' +
                     cluster.httpEgress.address().port;

    parallel([
        cluster.sendRequest.thunk({
            method: 'GET',
            path: '/such/stuff',
        }, null, {
            statusCode: 200,
            statusMessage: 'Ok',
            body: JSON.stringify({
                request: {
                    method: 'GET',
                    url: '/such/stuff',
                    headers: {
                        host: egressHost,
                        connection: 'keep-alive',
                    }
                }
            }) + '\n'
        }),
        cluster.sendRequest.thunk({
            method: 'PUT',
            path: '/wat/even/is',
            headers: {
                'Content-Type': 'text/plain',
                'X-Test-Header': 'test header one, test header two',
                'Set-Cookie': [ 'test cookie one', 'test cookie two'],
                'Max-Forwards': '5'
            }
        }, 'hello world', {
            statusCode: 200,
            statusMessage: 'Ok',
            body: JSON.stringify({
                request: {
                    method: 'PUT',
                    url: '/wat/even/is',
                    headers: {
                        'content-type': 'text/plain',
                        'x-test-header': 'test header one, test header two',
                        'set-cookie': [ 'test cookie one', 'test cookie two'],
                        'max-forwards': '5',
                        host:  egressHost,
                        connection: 'keep-alive',
                        'transfer-encoding': 'chunked'
                    }
                }
            }) + '\n' + JSON.stringify({
                chunk: 'hello world'
            }) + '\n'
        }),
        cluster.sendRequest.thunk({
            method: 'GET',
            path: '/returnStatus/420/obviously',
        }, null, {
            statusCode: 420,
            statusMessage: 'obviously',
            body: JSON.stringify({
                request: {
                    method: 'GET',
                    url: '/returnStatus/420/obviously',
                    headers:  {
                        host: egressHost,
                        connection: 'keep-alive',
                    }
                }
            }) + '\n'
        }),
    ], assert.end);
});

allocHTTPTest('as/http can bridge a service using lbpool (non-streaming)', {
    onServiceRequest: handleTestHTTPRequest,
    enableLBPool: true,
    verifyStats: true
}, function t(cluster, assert) {

    var egressHost = cluster.httpEgress.address().address + ':' +
        cluster.httpEgress.address().port;
    parallel([

        cluster.sendRequest.thunk({
            method: 'GET',
            path: '/such/stuff',
        }, null, {
            statusCode: 200,
            statusMessage: 'Ok',
            body: JSON.stringify({
                request: {
                    method: 'GET',
                    url: '/such/stuff',
                    headers: {
                        host: egressHost,
                        connection: 'keep-alive',
                        'content-length': '0'
                    }
                }
            }) + '\n'
        }),

        cluster.sendRequest.thunk({
            method: 'PUT',
            path: '/wat/even/is',
            headers: {
                'Content-Type': 'text/plain',
                'X-Test-Header': 'test header one, test header two',
                'Set-Cookie': [ 'test cookie one', 'test cookie two'],
                'Max-Forwards': '5'
            }
        }, 'hello world', {
            statusCode: 200,
            statusMessage: 'Ok',
            body:
                JSON.stringify({
                request: {
                    method: 'PUT',
                    url: '/wat/even/is',
                    headers: {
                        'content-type': 'text/plain',
                        'x-test-header': 'test header one, test header two',
                        'set-cookie': [ 'test cookie one', 'test cookie two'],
                        'max-forwards': '5',
                        host:  egressHost,
                        connection: 'keep-alive',
                        'transfer-encoding': 'chunked',
                        'content-length': '11'
                    }
                }
            }) + '\n' + JSON.stringify({
                chunk: 'hello world'
            }) + '\n'
        }),

        cluster.sendRequest.thunk({
            method: 'GET',
            path: '/returnStatus/420/obviously',
        }, null, {
            statusCode: 420,
            statusMessage: 'obviously',
            body: JSON.stringify({
                request: {
                    method: 'GET',
                    url: '/returnStatus/420/obviously',
                    headers:  {
                        host: egressHost,
                        connection: 'keep-alive',
                        'content-length': '0'
                    }
                }
            }) + '\n'
        }),

    ], assert.end);

});

allocHTTPTest('as/http can handle a timeout', {
    onServiceRequest: handleTestHTTPTimeout,
    expectedEgressError: function assertError(assert, err) {
        assert.ok(err.type === 'tchannel.request.timeout' ||
                  err.type === 'tchannel.timeout',
        'expected error');
    }
}, function t(cluster, assert) {
    parallel([
        cluster.sendRequest.thunk({
            method: 'GET',
            path: '/such/stuff',
        }, null, {
            statusCode: 504,
            statusMessage: 'Gateway Timeout'
        }),

    ], assert.end);
});

allocHTTPTest('as/http can do large requests', {
    onServiceRequest: handleHTTPPipe,
    enableLBPool: true
}, function t(cluster, assert) {
    var chunks = [];
    for (var i = 0; i < 4096; i++) {
        chunks.push('A');
    }

    var body = chunks.join('');
    makeRequest(cluster, body, onResponse);

    function onResponse(err, resp, respBody) {
        assert.ifError(err);

        assert.equal(resp.statusCode, 200);
        assert.equal(body, respBody);

        assert.end();
    }
});

allocHTTPTest('as/http can do massive requests', {
    onServiceRequest: handleHTTPPipe,
    enableLBPool: true
}, function t(cluster, assert) {
    var chunks = [];
    for (var i = 0; i < 95000; i++) {
        chunks.push('A');
    }

    var body = chunks.join('');
    makeRequest(cluster, body, onResponse);

    function onResponse(err, resp, respBody) {
        assert.ifError(err);

        assert.equal(resp.statusCode, 200);
        assert.equal(body, respBody);

        assert.end();
    }
});

function makeRequest(cluster, body, cb) {
    var decoder = new StringDecoder('utf8');
    var chunks = [];
    var req = http.request({
        host: cluster.requestOptions.host,
        port: cluster.requestOptions.port,
        method: 'POST',
        path: '/wat'
    }, onResponse);

    req.on('error', onError);
    req.end(body);

    function onError(err) {
        cb(err);
    }

    function onResponse(resp) {
        resp.on('data', onData);
        resp.on('end', onEnd);

        function onData(buffer) {
            chunks.push(decoder.write(buffer));
        }

        function onEnd() {
            cb(null, resp, chunks.join(''));
        }
    }
}

function handleHTTPPipe(hreq, hres) {
    hres.statusCode = 200;
    hreq.pipe(hres);
    hres.once('finish', onFinish);

    function onFinish() {
        hreq.connection.destroy();
    }
}

function handleTestHTTPTimeout(hreq, hres) {
    setTimeout(
        function onTimeout() {
            hres.end();
            hreq.connection.destroy();
        },
        200
    );
}

function handleTestHTTPRequest(hreq, hres) {
    var statusCode = 200;
    var statusMessage = 'Ok';
    var match = /\/returnStatus\/(\d+)(?:\/(.*))?/.exec(hreq.url);
    if (match) {
        statusCode = parseInt(match[1]);
        statusMessage = match[2] || '';
    }

    hres.writeHead(statusCode, statusMessage, {
        'content-type': 'application/json'
    });

    hres.write(JSON.stringify({
        request: {
            method: hreq.method,
            url: hreq.url,
            headers: hreq.headers
        }
    }) + '\n');
    hreq.on('data', onData);
    hreq.on('end', onEnd);

    function onData(chunk) {
        hres.write(JSON.stringify({
            chunk: String(chunk)
        }) + '\n');
    }

    function onEnd() {
        hres.end();
        hreq.connection.destroy();
    }
}

function allocHTTPTest(desc, opts, testFunc) {
    test(desc, function t(assert) {
        opts.assert = assert;
        var cluster = allocHTTPBridge(opts);
        assert.once('end', onAssertEnd);
        cluster.allReady(onReady);

        function onAssertEnd() {
            cluster.destroy();
        }

        function onReady() {
            testFunc(cluster, assert);
        }
    });
}

function allocHTTPBridge(opts) {
    // egress( HTTP -> TChannel ) -> ingress( TChannel -> HTTP )

    var cluster = allocCluster({
        numPeers: 2
    });
    var tdestroy = cluster.destroy;

    var cready = CountedReadySignal(3);
    cluster.destroy = destroy;
    cluster.ready(cready.signal);
    cluster.httpEgress = allocHTTPServer(opts.onEgressRequest, cready.signal);
    cluster.httpService = allocHTTPServer(opts.onServiceRequest, cready.signal);
    cluster.allReady = CountedReadySignal(1);
    var serviceName = opts.serviceName || 'test_http';
    var chanOpts = {
        serviceName: serviceName,
        requestDefaults: {
            serviceName: serviceName,
            headers: {
                cn: 'wat'
            }
        }
    };

    cluster.ingressServer = cluster.channels[0];
    cluster.egressServer = cluster.channels[1];

    cluster.ingressChan = cluster.ingressServer.makeSubChannel(chanOpts);
    cluster.egressChan = cluster.egressServer.makeSubChannel(chanOpts);

    if (opts.verifyStats) {
        cluster.stats = [];
        cluster.ingressServer.on('stat', function onStat(stat) {
            cluster.stats.push(stat);
        });
    }

    cluster.httpEgress.on('request', onEgressRequest);

    cluster.requestOptions = {
        keepAlive: true
    };
    cluster.sendRequest = testRequester(opts.assert, cluster.requestOptions);

    cready(onReady);

    function onReady() {
        if (!cluster.ingressServer.hostPort) throw new Error('no ingress hostPort');
        cluster.egressChan.peers.add(cluster.ingressServer.hostPort);

        var addr = cluster.httpEgress.address();
        cluster.requestOptions.host = addr.address;
        cluster.requestOptions.port = addr.port;
        if (opts.enableLBPool) {
            var dest = cluster.httpService.address().address + ':' +
                cluster.httpService.address().port;
            opts.lbpool = new LBPool(http, [dest], {
                'keep_alive': true
            });
        }
        cluster.asHTTP = new TChannelHTTP(opts);
        cluster.asHTTP.setHandler(cluster.ingressChan, onIngressRequest);
        cluster.allReady.signal();
    }

    function onIngressRequest(treq, tres) {
        var addr = cluster.httpService.address();
        cluster.asHTTP.forwardToHTTP(cluster.ingressChan, {
            host: addr.address,
            port: addr.port
        }, treq, tres, onIngressComplete);
    }

    function onEgressRequest(hreq, hres) {
        cluster.asHTTP.forwardToTChannel(
            cluster.egressChan,
            hreq,
            hres,
            {streamed: !opts.enableLBPool},
            onEgressComplete);
    }

    function onIngressComplete(err) {
        opts.assert.error(err);
    }

    function onEgressComplete(err) {
        if (opts.expectedEgressError) {
            if (typeof opts.expectedEgressError === 'function') {
                opts.expectedEgressError(opts.assert, err);
            } else {
                var expected = opts.expectedEgressError;
                opts.assert.equal(err.type, expected.type);
                opts.assert.equal(err.name, expected.name);
            }
            return;
        }
        opts.assert.error(err);
    }

    function destroy(callback) {
        var closed = CountedReadySignal(3);
        tdestroy(closed.signal);
        cluster.httpEgress.close(closed.signal);
        cluster.httpService.close(closed.signal);
        if (opts.lbpool) opts.lbpool.close();

        if (opts.verifyStats) {
            process.nextTick(checkStat);
        }

        function checkStat() {
            var statsByName = collectStatsByName(opts.assert, cluster.stats);
            validators.validate(opts.assert, statsByName, fixture);
        }
        if (callback) closed(callback);
    }

    return cluster;
}

function testRequester(assert, baseOptions) {
    testRequest.thunk = testRequestBind;
    return testRequest;

    function testRequestBind(options, body, expected) {
        return function testRequestThunk(callback) {
            testRequest(options, body, expected, callback);
        };
    }

    function testRequest(options, body, expected, callback) {
        if (typeof expected === 'function') {
            callback = expected;
            expected = body;
            body = null;
        }

        options = extend(baseOptions, options);
        var req = http.request(options, onResponse);

        if (!options.host) throw new Error('no host specified');
        if (!options.port) throw new Error('no port specified');

        var buf = PassThrough();
        req.on('error', onError);
        if (body) req.write(body);
        req.end();

        function onError(err) {
            callback(err);
        }

        function onResponse(res) {
            assert.equal(res.statusCode, expected.statusCode, 'expected status code');

            // TODO: >= 0.12
            // assert.equal(res.statusMessage, expected.statusMessage, 'expected status message');

            res.on('end', onEnd);
            res.pipe(buf);
        }

        function onEnd() {
            if (expected.body) {
                assert.equal(String(buf.read()), expected.body, 'expected body');
            }
            callback(null);
        }
    }
}

function allocHTTPServer(onRequest, callback) {
    var httpServer = http.createServer(onRequest);
    httpServer.listen(0, '127.0.0.1', onListening);
    return httpServer;
    function onListening() {
        callback();
    }
}

function collectStatsByName(assert, stats) {
    var byName = {};
    for (var i = 0; i < stats.length; i++) {
        var stat = stats[i];
        byName[stat.name] = stat;
    }
    return byName;
}
