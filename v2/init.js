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
var header = require('./header');
var errors = require('../errors');

module.exports.Request = InitRequest;
module.exports.Response = InitResponse;

var RequiredHeaderFields = ['host_port', 'process_name'];

function InitRequest(version, headers) {
    var self = this;
    self.type = InitRequest.TypeCode;
    self.version = version || 0;
    self.headers = headers || {};
}

InitRequest.TypeCode = 0x01;

InitRequest.RW = bufrw.Base(initReqLength, readInitReqFrom, writeInitReqInto);

function initReqLength(body) {
    var res;
    var length = 0;

    // version:2
    length += bufrw.UInt16BE.length;

    // nh:2 (hk~2 hv~2){nh}
    res = header.header2.byteLength(body.headers);
    if (res.err) return res;
    length += res.length;

    res.length = length;
    return res;
}

function readInitReqFrom(buffer, offset) {
    var res;
    var body = new InitRequest();

    // version:2
    res = bufrw.UInt16BE.readFrom(buffer, offset);
    if (res.err) return res;
    offset = res.offset;
    body.version = res.value;

    // nh:2 (hk~2 hv~2){nh}
    res = header.header2.readFrom(buffer, offset);
    if (res.err) return res;
    offset = res.offset;
    body.headers = res.value;

    return readFieldGuard(body, buffer, offset);
}

function writeInitReqInto(body, buffer, offset) {
    var res;

    res = writeFieldGuard(body, buffer, offset);
    if (res.err) return res;

    // version:2
    res = bufrw.UInt16BE.writeInto(body.version, buffer, offset);
    if (res.err) return res;
    offset = res.offset;

    // nh:2 (hk~2 hv~2){nh}
    res = header.header2.writeInto(body.headers, buffer, offset);
    if (res.err) return res;
    offset = res.offset;

    return res;
}

// TODO: MissingInitHeaderError check / guard

function InitResponse(version, headers) {
    var self = this;
    self.type = InitResponse.TypeCode;
    self.version = version || 0;
    self.headers = headers || {};
}

InitResponse.TypeCode = 0x02;

InitResponse.RW = bufrw.Base(initResLength, readInitRes, writeInitRes);

function initResLength(body) {
    var res;
    var length = 0;

    // version:2
    length += bufrw.UInt16BE.length;

    // nh:2 (hk~2 hv~2){nh}
    res = header.header2.byteLength(body.headers);
    if (res.err) return res;
    length += res.length;

    return res;
}

function readInitRes(buffer, offset) {
    var res;
    var body = new InitResponse;

    // version:2
    res = bufrw.UInt16BE.readFrom(buffer, offset);
    if (res.err) return res;
    offset = res.offset;
    body.version = res.value;

    // nh:2 (hk~2 hv~2){nh}
    res = header.header2.readFrom(buffer, offset);
    if (res.err) return res;
    offset = res.offset;
    body.headers = res.value;

    return readFieldGuard(body, buffer, offset);
}

function writeInitRes(body, buffer, offset) {
    var res;

    res = writeFieldGuard(body, buffer, offset);
    if (res.err) return res;

    // version:2
    res = bufrw.UInt16BE.writeInto(body.version, buffer, offset);
    if (res.err) return res;
    offset = res.offset;

    // nh:2 (hk~2 hv~2){nh}
    res = header.header2.writeInto(body.headers, buffer, offset);
    if (res.err) return res;
    offset = res.offset;

    return res;
}


function writeFieldGuard(initBody, buffer, offset) {
    var err = requiredFieldGuard(initBody.headers);
    if (err) return WriteResult.error(err, offset);
    else return WriteResult.just(offset);
}

function readFieldGuard(initBody, buffer, offset) {
    var err = requiredFieldGuard(initBody.headers);
    if (err) return ReadResult.error(err, offset);
    else return ReadResult.just(offset, initBody);
}

function requiredFieldGuard(headers) {
    for (var i = 0; i < RequiredHeaderFields.length; i++) {
        var field = RequiredHeaderFields[i];
        if (headers[field] === undefined) {
            return errors.MissingInitHeaderError({field: field});
        }
    }
    return null;
}
