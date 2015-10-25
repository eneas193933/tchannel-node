// Copyright (c) 2015 Uber Technologies, Inc.

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

var bufrw = require('bufrw');
var WriteResult = bufrw.WriteResult;
var ReadResult = bufrw.ReadResult;
var TypedError = require('error/typed');

var ObjectPool = require('../lib/object-pool.js');
var Frame = require('./frame');
var Tracing = require('./tracing');

var errors = require('../errors');

// TODO: enforce message ID of this frame is Frame.NullId when
// errorBody.code.ProtocolError = ErrorResponse.Codes.ProtocolError

// code:1 tracing:25 message~2
function ErrorResponse() {
    var self = this;

    self.type = ErrorResponse.TypeCode;
    self.code = 0;
    self.tracing = Tracing.emptyTracing;
    self.message = '';
}

ErrorResponse.prototype.reset =
function reset() {
    var self = this;

    self.code = 0;
    self.tracing = Tracing.emptyTracing;
    self.message = '';
};

ObjectPool.setup(ErrorResponse);

ErrorResponse.TypeCode = 0xff;

var Codes = Object.create(null);
// 0x00 not a valid value for "code", do not use.
Codes.Timeout = 0x01;
Codes.Cancelled = 0x02;
Codes.Busy = 0x03;
Codes.Declined = 0x04;
Codes.UnexpectedError = 0x05;
Codes.BadRequest = 0x06;
Codes.NetworkError = 0x07;
Codes.Unhealthy = 0x08;
Codes.ProtocolError = 0xff;

var CodeNames = Object.create(null);
CodeNames[Codes.Timeout] = 'Timeout';
CodeNames[Codes.Cancelled] = 'Cancelled';
CodeNames[Codes.Busy] = 'Busy';
CodeNames[Codes.Declined] = 'Declined';
CodeNames[Codes.UnexpectedError] = 'UnexpectedError';
CodeNames[Codes.BadRequest] = 'BadRequest';
CodeNames[Codes.NetworkError] = 'NetworkError';
CodeNames[Codes.ProtocolError] = 'ProtocolError';
CodeNames[Codes.Unhealthy] = 'Unhealthy';

var CodeErrors = Object.create(null);
CodeErrors[Codes.Timeout] = TypedError({
    type: 'tchannel.timeout',
    message: 'TChannel timeout',
    isErrorFrame: true,
    codeName: 'Timeout',
    errorCode: Codes.Timeout,
    originalId: null
});
CodeErrors[Codes.Cancelled] = TypedError({
    type: 'tchannel.cancelled',
    message: 'TChannel cancelled',
    isErrorFrame: true,
    codeName: 'Cancelled',
    errorCode: Codes.Cancelled,
    originalId: null
});
CodeErrors[Codes.Busy] = TypedError({
    type: 'tchannel.busy',
    message: 'TChannel busy',
    isErrorFrame: true,
    codeName: 'Busy',
    errorCode: Codes.Busy,
    originalId: null
});
CodeErrors[Codes.Declined] = TypedError({
    type: 'tchannel.declined',
    message: 'TChannel declined',
    isErrorFrame: true,
    codeName: 'Declined',
    errorCode: Codes.Declined,
    originalId: null
});
CodeErrors[Codes.UnexpectedError] = TypedError({
    type: 'tchannel.unexpected',
    message: 'TChannel unexpected error',
    isErrorFrame: true,
    codeName: 'UnexpectedError',
    errorCode: Codes.UnexpectedError,
    originalId: null
});
CodeErrors[Codes.BadRequest] = TypedError({
    type: 'tchannel.bad-request',
    message: 'TChannel bad request',
    isErrorFrame: true,
    codeName: 'BadRequest',
    errorCode: Codes.BadRequest,
    originalId: null
});
CodeErrors[Codes.NetworkError] = TypedError({
    type: 'tchannel.network',
    message: 'TChannel network error',
    isErrorFrame: true,
    codeName: 'NetworkError',
    errorCode: Codes.NetworkError,
    originalId: null
});
CodeErrors[Codes.ProtocolError] = TypedError({
    type: 'tchannel.protocol',
    message: 'TChannel protocol error',
    isErrorFrame: true,
    codeName: 'ProtocolError',
    errorCode: Codes.ProtocolError,
    originalId: null
});
CodeErrors[Codes.Unhealthy] = TypedError({
    type: 'tchannel.unhealthy',
    message: 'TChannel unhealthy',
    isErrorFrame: true,
    codeName: 'Unhealthy',
    errorCode: Codes.Unhealthy,
    originalId: null
});

ErrorResponse.Codes = Codes;
ErrorResponse.CodeNames = CodeNames;
ErrorResponse.CodeErrors = CodeErrors;

ErrorResponse.RW = bufrw.Base(errResLength, readErrResFrom, writeErrResInto);

function errResLength(body) {
    var res;
    var length = 0;

    // code:1
    length += bufrw.UInt8.width;

    // tracing:25
    length += 25; // Tracing.RW

    // message~2
    res = bufrw.str2.byteLength(body.message);
    if (res.body) return res;
    length += res.length;

    res.length = length;
    return res;
}

function readErrResFrom(buffer, offset) {
    var res;
    var body = ErrorResponse.alloc();

    // code:1
    res = bufrw.UInt8.readFrom(buffer, offset);
    if (res.err) {
        body.free();
        return res;
    }
    offset = res.offset;
    body.code = res.value;

    // tracing:25
    res = Tracing.RW.readFrom(buffer, offset);
    if (res.err) {
        body.free();
        return res;
    }
    offset = res.offset;
    body.tracing = res.value;

    if (CodeNames[body.code] === undefined) {
        var err = errors.InvalidErrorCodeError({
            errorCode: body.code,
            tracing: body.tracing
        });
        body.free();
        return ReadResult.error(err, offset);
    }

    // message~2
    res = bufrw.str2.readFrom(buffer, offset);
    if (res.err) {
        body.free();
        return res;
    }
    offset = res.offset;
    body.message = res.value;

    res.value = body;
    return res;
}

function writeErrResInto(body, buffer, offset) {
    var res;

    if (CodeNames[body.code] === undefined) {
        return WriteResult.error(errors.InvalidErrorCodeError({
            errorCode: body.code,
            tracing: body.tracing
        }), offset);
    }

    // code:1
    res = bufrw.UInt8.writeInto(body.code, buffer, offset);
    if (res.err) return res;
    offset = res.offset;

    // tracing:25
    res = Tracing.RW.writeInto(body.tracing, buffer, offset);
    if (res.err) return res;
    offset = res.offset;

    // message~2
    return bufrw.str2.writeInto(body.message, buffer, offset);
}

ErrorResponse.RW.lazy = {};

ErrorResponse.RW.lazy.isFrameTerminal = function isFrameTerminal() {
    return true;
};

ErrorResponse.RW.lazy.codeOffset = Frame.Overhead;
ErrorResponse.RW.lazy.readCode = function readCode(frame) {
    // code:1
    return bufrw.UInt8.readFrom(frame.buffer, ErrorResponse.RW.lazy.codeOffset);
};

ErrorResponse.RW.lazy.tracingOffset = ErrorResponse.RW.lazy.codeOffset + 1;
ErrorResponse.RW.lazy.readTracing = function readTracing(frame) {
    // tracing:25
    return Tracing.RW.readFrom(frame.buffer, ErrorResponse.RW.lazy.tracingOffset);
};

ErrorResponse.RW.lazy.mesasgeOffset = ErrorResponse.RW.lazy.tracingOffset + 25;
ErrorResponse.RW.lazy.readMessage = function readMessage(frame) {
    // mesasge~2
    return bufrw.str2.readFrom(frame.buffer, ErrorResponse.RW.lazy.mesasgeOffset);
};

module.exports = ErrorResponse;
