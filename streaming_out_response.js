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


var inherits = require('util').inherits;

var OutArgStream = require('./argstream').OutArgStream;
var OutResponse = require('./out_response');
var errors = require('./errors');
var States = require('./reqres_states');

function StreamingOutResponse(id, options) {
    var self = this;
    OutResponse.call(self, id, options);
    self.streamed = true;
    self._argstream = OutArgStream();
    self.arg1 = self._argstream.arg1;
    self.arg2 = self._argstream.arg2;
    self.arg3 = self._argstream.arg3;
    self._argstream.on('error', passError);
    self._argstream.on('frame', onFrame);
    self._argstream.on('finish', onFinish);

    function passError(err) {
        self.emit('error', err);
    }

    function onFrame(parts, isLast) {
        self.sendParts(parts, isLast);
    }

    function onFinish() {
        self.emit('finish');
    }
}

inherits(StreamingOutResponse, OutResponse);

StreamingOutResponse.prototype.type = 'tchannel.outgoing-response.streaming';

StreamingOutResponse.prototype.sendError = function sendError(codeString, message) {
    var self = this;
    if (self.state === States.Done || self.state === States.Error) {
        self.emit('error', errors.ResponseAlreadyDone({
            attempted: 'send error frame: ' + codeString + ': ' + message
        }));
    } else {
        if (self.span) {
            self.span.annotate('ss');
        }
        self.state = States.Error;
        self._argstream.finished = true;
        self.arg1.end();
        self.arg2.end();
        self.arg3.end();
        self.sendFrame.error(codeString, message);
        self.emit('errored', codeString, message);
        self.emit('finish');
    }
};

StreamingOutResponse.prototype.setOk = function setOk(ok) {
    var self = this;
    if (self.state !== States.Initial) {
        self.emit('error', errors.ResponseAlreadyStarted({
            state: self.state
        }));
    }
    self.ok = ok;
    self.code = ok ? 0 : 1; // TODO: too coupled to v2 specifics?
    self.arg1.end();
};

StreamingOutResponse.prototype.send = function send(res1, res2) {
    var self = this;
    self.arg2.end(res1);
    self.arg3.end(res2);
};

module.exports = StreamingOutResponse;